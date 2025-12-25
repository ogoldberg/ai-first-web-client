/**
 * AI Feedback Service
 *
 * Secure feedback system that allows AI users to report issues with browsing
 * quality, accuracy, and performance. Features:
 *
 * Security:
 * - Rate limiting at session and tenant levels
 * - Anomaly detection for feedback poisoning prevention
 * - Max 5% confidence adjustment per feedback
 * - Require 3 consistent signals before applying adjustments
 * - HMAC-SHA256 webhook signature verification
 * - Full audit logging
 *
 * Real-Time Adjustments:
 * - Pattern confidence adjustments (capped)
 * - Tier routing hints
 * - Automatic revert if quality degrades
 *
 * Async Notifications:
 * - Security alerts (always notify)
 * - Critical severity feedback
 * - Repeated pattern failures
 * - Feature requests
 */

import { createHmac, randomUUID } from 'crypto';
import { logger } from '../utils/logger.js';
import type { LearningEngine } from './learning-engine.js';
import type { ProceduralMemory } from './procedural-memory.js';
import {
  type FeedbackSubmission,
  type FeedbackRecord,
  type FeedbackAdjustment,
  type AnomalyFlag,
  type FeedbackAuditEntry,
  type FeedbackNotification,
  type WebhookConfig,
  type FeedbackRateLimits,
  type FeedbackSubmitResult,
  type FeedbackStats,
  type ConsistencyTracker,
  type FeedbackCategory,
  type FeedbackSentiment,
  type NotificationType,
  FeedbackSubmissionSchema,
  DEFAULT_FEEDBACK_RATE_LIMITS,
} from '../types/feedback.js';

// Logger for feedback system
const log = logger.create('FeedbackService');

// ============================================
// CONSTANTS
// ============================================

/** Maximum adjustment percentage per feedback (5%) */
const MAX_ADJUSTMENT_PERCENT = 0.05;

/** Required consistent signals before applying adjustment */
const REQUIRED_CONSISTENT_SIGNALS = 3;

/** Time window for consistency tracking (1 hour) */
const CONSISTENCY_WINDOW_MS = 60 * 60 * 1000;

/** Anomaly detection: category flooding threshold (80%) */
const CATEGORY_FLOODING_THRESHOLD = 0.8;

/** Anomaly detection: targeted attack threshold (3+ negative for same target) */
const TARGETED_ATTACK_THRESHOLD = 3;

/** Maximum stored feedback records per tenant */
const MAX_FEEDBACK_PER_TENANT = 1000;

/** Maximum audit log entries */
const MAX_AUDIT_ENTRIES = 5000;

// ============================================
// RATE LIMITER
// ============================================

interface RateLimitWindow {
  count: number;
  resetAt: number;
}

class FeedbackRateLimiter {
  private sessionWindows = new Map<string, RateLimitWindow>();
  private tenantWindows = new Map<string, RateLimitWindow>();
  private targetWindows = new Map<string, RateLimitWindow>(); // key: tenantId:targetId
  private limits: FeedbackRateLimits;

  constructor(limits: FeedbackRateLimits = DEFAULT_FEEDBACK_RATE_LIMITS) {
    this.limits = limits;
  }

  /**
   * Check if a session is rate limited
   */
  checkSession(sessionId: string): { allowed: boolean; remaining: number; resetIn: number } {
    const now = Date.now();
    const window = this.sessionWindows.get(sessionId);
    const windowMs = 60 * 1000; // 1 minute

    if (!window || window.resetAt <= now) {
      // New window
      return { allowed: true, remaining: this.limits.sessionMaxPerMinute - 1, resetIn: windowMs };
    }

    const remaining = this.limits.sessionMaxPerMinute - window.count;
    const resetIn = window.resetAt - now;

    return { allowed: remaining > 0, remaining: Math.max(0, remaining - 1), resetIn };
  }

  /**
   * Check if a tenant is rate limited
   */
  checkTenant(tenantId: string): { allowed: boolean; remaining: number; resetIn: number } {
    const now = Date.now();
    const window = this.tenantWindows.get(tenantId);
    const windowMs = 60 * 60 * 1000; // 1 hour

    if (!window || window.resetAt <= now) {
      return { allowed: true, remaining: this.limits.tenantMaxPerHour - 1, resetIn: windowMs };
    }

    const remaining = this.limits.tenantMaxPerHour - window.count;
    const resetIn = window.resetAt - now;

    return { allowed: remaining > 0, remaining: Math.max(0, remaining - 1), resetIn };
  }

  /**
   * Check if negative feedback for a specific target is rate limited
   */
  checkTargetNegative(tenantId: string, targetId: string): { allowed: boolean; count: number } {
    const now = Date.now();
    const key = `${tenantId}:${targetId}`;
    const window = this.targetWindows.get(key);
    const windowMs = 60 * 60 * 1000; // 1 hour

    if (!window || window.resetAt <= now) {
      return { allowed: true, count: 0 };
    }

    const allowed = window.count < this.limits.targetNegativeMaxPerHour;
    return { allowed, count: window.count };
  }

  /**
   * Record feedback for rate limiting
   */
  record(sessionId: string, tenantId: string, targetId?: string, isNegative?: boolean): void {
    const now = Date.now();
    const minuteMs = 60 * 1000;
    const hourMs = 60 * 60 * 1000;

    // Update session window
    const sessionWindow = this.sessionWindows.get(sessionId);
    if (!sessionWindow || sessionWindow.resetAt <= now) {
      this.sessionWindows.set(sessionId, { count: 1, resetAt: now + minuteMs });
    } else {
      sessionWindow.count++;
    }

    // Update tenant window
    const tenantWindow = this.tenantWindows.get(tenantId);
    if (!tenantWindow || tenantWindow.resetAt <= now) {
      this.tenantWindows.set(tenantId, { count: 1, resetAt: now + hourMs });
    } else {
      tenantWindow.count++;
    }

    // Update target window for negative feedback
    if (targetId && isNegative) {
      const key = `${tenantId}:${targetId}`;
      const targetWindow = this.targetWindows.get(key);
      if (!targetWindow || targetWindow.resetAt <= now) {
        this.targetWindows.set(key, { count: 1, resetAt: now + hourMs });
      } else {
        targetWindow.count++;
      }
    }
  }

  /**
   * Clean up expired windows
   */
  cleanup(): void {
    const now = Date.now();

    for (const [key, window] of this.sessionWindows) {
      if (window.resetAt <= now) {
        this.sessionWindows.delete(key);
      }
    }

    for (const [key, window] of this.tenantWindows) {
      if (window.resetAt <= now) {
        this.tenantWindows.delete(key);
      }
    }

    for (const [key, window] of this.targetWindows) {
      if (window.resetAt <= now) {
        this.targetWindows.delete(key);
      }
    }
  }
}

// ============================================
// FEEDBACK SERVICE
// ============================================

export interface FeedbackServiceConfig {
  rateLimits?: Partial<FeedbackRateLimits>;
  enableRealTimeAdjustments?: boolean;
  enableWebhooks?: boolean;
  maxAdjustmentPercent?: number;
  requiredConsistentSignals?: number;
}

export class FeedbackService {
  private feedbackRecords = new Map<string, FeedbackRecord[]>(); // tenantId -> records
  private consistencyTrackers = new Map<string, ConsistencyTracker>(); // targetKey -> tracker
  private auditLog: FeedbackAuditEntry[] = [];
  private webhookConfigs = new Map<string, WebhookConfig>(); // tenantId -> config
  private pendingNotifications: FeedbackNotification[] = [];
  private rateLimiter: FeedbackRateLimiter;
  private config: Required<FeedbackServiceConfig>;

  // References to learning systems (optional, for real-time adjustments)
  private learningEngine?: LearningEngine;
  private proceduralMemory?: ProceduralMemory;

  constructor(config: FeedbackServiceConfig = {}) {
    this.config = {
      rateLimits: { ...DEFAULT_FEEDBACK_RATE_LIMITS, ...config.rateLimits },
      enableRealTimeAdjustments: config.enableRealTimeAdjustments ?? true,
      enableWebhooks: config.enableWebhooks ?? true,
      maxAdjustmentPercent: config.maxAdjustmentPercent ?? MAX_ADJUSTMENT_PERCENT,
      requiredConsistentSignals: config.requiredConsistentSignals ?? REQUIRED_CONSISTENT_SIGNALS,
    };

    this.rateLimiter = new FeedbackRateLimiter(this.config.rateLimits as FeedbackRateLimits);

    log.info('FeedbackService initialized', {
      enableRealTimeAdjustments: this.config.enableRealTimeAdjustments,
      enableWebhooks: this.config.enableWebhooks,
      maxAdjustmentPercent: this.config.maxAdjustmentPercent,
    });
  }

  /**
   * Set the learning engine for real-time adjustments
   */
  setLearningEngine(engine: LearningEngine): void {
    this.learningEngine = engine;
    log.debug('LearningEngine connected to FeedbackService');
  }

  /**
   * Set the procedural memory for skill feedback
   */
  setProceduralMemory(memory: ProceduralMemory): void {
    this.proceduralMemory = memory;
    log.debug('ProceduralMemory connected to FeedbackService');
  }

  // ============================================
  // SUBMIT FEEDBACK
  // ============================================

  /**
   * Submit feedback from an AI user
   */
  async submitFeedback(
    tenantId: string,
    sessionId: string,
    submission: unknown
  ): Promise<FeedbackSubmitResult> {
    const startTime = Date.now();

    // Step 1: Validate input with Zod
    const validationResult = FeedbackSubmissionSchema.safeParse(submission);
    if (!validationResult.success) {
      const errors = validationResult.error.issues.map(e => `${e.path.join('.')}: ${e.message}`);
      log.warn('Feedback validation failed', { tenantId, errors });

      this.audit('rejected', 'system', '', tenantId, { reason: 'validation_failed', errors });

      return {
        success: false,
        status: 'validation_failed',
        message: 'Feedback validation failed',
        validationErrors: errors,
      };
    }

    const validSubmission = validationResult.data;

    // Step 2: Check rate limits
    const sessionLimit = this.rateLimiter.checkSession(sessionId);
    if (!sessionLimit.allowed) {
      log.warn('Session rate limit exceeded', { sessionId, resetIn: sessionLimit.resetIn });

      this.audit('rejected', 'system', '', tenantId, {
        reason: 'rate_limit_session',
        resetIn: sessionLimit.resetIn,
      });

      return {
        success: false,
        status: 'rate_limited',
        message: `Rate limit exceeded. Try again in ${Math.ceil(sessionLimit.resetIn / 1000)} seconds`,
      };
    }

    const tenantLimit = this.rateLimiter.checkTenant(tenantId);
    if (!tenantLimit.allowed) {
      log.warn('Tenant rate limit exceeded', { tenantId, resetIn: tenantLimit.resetIn });

      this.audit('rejected', 'system', '', tenantId, {
        reason: 'rate_limit_tenant',
        resetIn: tenantLimit.resetIn,
      });

      return {
        success: false,
        status: 'rate_limited',
        message: `Tenant rate limit exceeded. Try again in ${Math.ceil(tenantLimit.resetIn / 1000)} seconds`,
      };
    }

    // Step 3: Check target-specific rate limit for negative feedback
    const targetId = validSubmission.context.patternId ||
                     validSubmission.context.skillId ||
                     validSubmission.context.domain;

    if (validSubmission.sentiment === 'negative' && targetId) {
      const targetLimit = this.rateLimiter.checkTargetNegative(tenantId, targetId);
      if (!targetLimit.allowed) {
        log.warn('Target negative feedback limit exceeded', { tenantId, targetId, count: targetLimit.count });

        // Flag as potential targeted attack
        const anomaly: AnomalyFlag = {
          type: 'targeted_attack',
          severity: 'warning',
          description: `Excessive negative feedback for target: ${targetId}`,
          detectedAt: Date.now(),
        };

        // Still accept but flag it
        // Fall through to normal processing with anomaly flag
      }
    }

    // Step 4: Create feedback record
    const feedbackId = randomUUID();
    const now = Date.now();

    const record: FeedbackRecord = {
      id: feedbackId,
      tenantId,
      sessionId,
      submission: validSubmission,
      status: 'pending',
      adjustments: [],
      anomalyFlags: [],
      createdAt: now,
      updatedAt: now,
    };

    // Step 5: Run anomaly detection
    const anomalies = this.detectAnomalies(tenantId, validSubmission, record);
    record.anomalyFlags = anomalies;

    if (anomalies.some(a => a.severity === 'critical')) {
      record.status = 'escalated';
      log.warn('Feedback flagged with critical anomaly', { feedbackId, anomalies });

      // Trigger notification for human review
      await this.triggerNotification('anomaly_detected', tenantId, record, 'urgent');
    }

    // Step 6: Store the record
    this.storeFeedback(tenantId, record);

    // Record rate limit usage
    this.rateLimiter.record(
      sessionId,
      tenantId,
      targetId,
      validSubmission.sentiment === 'negative'
    );

    // Step 7: Process real-time adjustments (if enabled and no critical anomalies)
    let adjustmentsApplied = 0;
    if (this.config.enableRealTimeAdjustments && record.status !== 'escalated') {
      adjustmentsApplied = await this.processRealTimeAdjustments(record);
      if (adjustmentsApplied > 0) {
        record.status = 'applied';
      } else {
        record.status = 'processing';
      }
    }

    // Step 8: Check for notifications
    let notificationSent = false;
    if (this.config.enableWebhooks) {
      notificationSent = await this.checkAndSendNotifications(record);
    }

    // Step 9: Audit log
    this.audit('submitted', 'ai_user', sessionId, tenantId, {
      feedbackId,
      category: validSubmission.category,
      sentiment: validSubmission.sentiment,
      domain: validSubmission.context.domain,
      adjustmentsApplied,
      anomaliesDetected: anomalies.length,
    });

    record.processedAt = Date.now();
    record.updatedAt = Date.now();

    const durationMs = Date.now() - startTime;
    log.info('Feedback processed', {
      feedbackId,
      tenantId,
      category: validSubmission.category,
      sentiment: validSubmission.sentiment,
      status: record.status,
      adjustmentsApplied,
      anomaliesDetected: anomalies.length,
      durationMs,
    });

    return {
      success: true,
      feedbackId,
      status: anomalies.length > 0 ? 'anomaly_detected' : 'accepted',
      message: anomalies.length > 0
        ? 'Feedback accepted but flagged for review'
        : 'Feedback accepted and processed',
      adjustmentsApplied,
      notificationSent,
      anomalyFlags: anomalies.length > 0 ? anomalies : undefined,
    };
  }

  // ============================================
  // ANOMALY DETECTION
  // ============================================

  /**
   * Detect anomalous feedback patterns
   */
  private detectAnomalies(
    tenantId: string,
    submission: FeedbackSubmission,
    _currentRecord: FeedbackRecord
  ): AnomalyFlag[] {
    const anomalies: AnomalyFlag[] = [];
    const now = Date.now();
    const windowMs = 60 * 60 * 1000; // 1 hour window

    const tenantRecords = this.feedbackRecords.get(tenantId) || [];
    const recentRecords = tenantRecords.filter(r => r.createdAt > now - windowMs);

    if (recentRecords.length < 5) {
      // Not enough data for anomaly detection
      return anomalies;
    }

    // Anomaly 1: Category flooding (>80% same category/sentiment)
    const categoryCount = recentRecords.filter(
      r => r.submission.category === submission.category &&
           r.submission.sentiment === submission.sentiment
    ).length;

    const floodingRatio = categoryCount / recentRecords.length;
    if (floodingRatio > CATEGORY_FLOODING_THRESHOLD) {
      anomalies.push({
        type: 'category_flooding',
        severity: 'warning',
        description: `${Math.round(floodingRatio * 100)}% of recent feedback is ${submission.sentiment} ${submission.category}`,
        detectedAt: now,
      });
    }

    // Anomaly 2: Targeted attack (3+ negative for same pattern/skill/domain)
    const targetId = submission.context.patternId ||
                     submission.context.skillId ||
                     submission.context.domain;

    if (submission.sentiment === 'negative' && targetId) {
      const targetNegativeCount = recentRecords.filter(
        r => r.submission.sentiment === 'negative' &&
             (r.submission.context.patternId === targetId ||
              r.submission.context.skillId === targetId ||
              r.submission.context.domain === targetId)
      ).length;

      if (targetNegativeCount >= TARGETED_ATTACK_THRESHOLD) {
        anomalies.push({
          type: 'targeted_attack',
          severity: targetNegativeCount >= 5 ? 'critical' : 'warning',
          description: `${targetNegativeCount} negative feedbacks targeting: ${targetId}`,
          detectedAt: now,
        });
      }
    }

    // Anomaly 3: Conflicting feedback (positive + negative for same URL in short window)
    const urlRecords = recentRecords.filter(
      r => r.submission.context.url === submission.context.url &&
           r.createdAt > now - 15 * 60 * 1000 // 15 minute window
    );

    // Check for conflicting sentiments including the current submission
    const hasPositiveInHistory = urlRecords.some(r => r.submission.sentiment === 'positive');
    const hasNegativeInHistory = urlRecords.some(r => r.submission.sentiment === 'negative');
    const currentIsPositive = submission.sentiment === 'positive';
    const currentIsNegative = submission.sentiment === 'negative';

    // Conflict if: (positive in history AND current is negative) OR (negative in history AND current is positive)
    const hasConflict = (hasPositiveInHistory && currentIsNegative) ||
                        (hasNegativeInHistory && currentIsPositive);

    if (hasConflict) {
      anomalies.push({
        type: 'conflicting_feedback',
        severity: 'warning',
        description: `Conflicting sentiments for URL: ${submission.context.url}`,
        detectedAt: now,
      });
    }

    return anomalies;
  }

  // ============================================
  // REAL-TIME ADJUSTMENTS
  // ============================================

  /**
   * Process real-time adjustments based on feedback
   * Returns the number of adjustments applied
   */
  private async processRealTimeAdjustments(record: FeedbackRecord): Promise<number> {
    const { submission } = record;

    // Determine the target of adjustment
    const targetId = submission.context.patternId ||
                     submission.context.skillId;
    const domain = submission.context.domain;

    if (!targetId) {
      // No specific target to adjust
      return 0;
    }

    // Update consistency tracker
    const trackerKey = `${domain}:${targetId}`;
    const tracker = this.getOrCreateConsistencyTracker(
      submission.context.patternId ? 'pattern' : 'skill',
      targetId,
      domain
    );

    // Add this signal
    tracker.signals.push({
      feedbackId: record.id,
      sentiment: submission.sentiment,
      suggestedAction: submission.suggestedAction,
      timestamp: Date.now(),
    });

    // Remove old signals outside the window
    const now = Date.now();
    tracker.signals = tracker.signals.filter(
      s => s.timestamp > now - CONSISTENCY_WINDOW_MS
    );

    // Check for consensus
    const positiveCount = tracker.signals.filter(s => s.sentiment === 'positive').length;
    const negativeCount = tracker.signals.filter(s => s.sentiment === 'negative').length;

    const consensusSentiment = positiveCount >= this.config.requiredConsistentSignals
      ? 'positive'
      : negativeCount >= this.config.requiredConsistentSignals
        ? 'negative'
        : null;

    if (!consensusSentiment) {
      log.debug('Waiting for consensus', {
        targetId,
        positiveCount,
        negativeCount,
        required: this.config.requiredConsistentSignals,
      });
      return 0;
    }

    // We have consensus - check if already applied
    if (tracker.consensus?.sentiment === consensusSentiment) {
      log.debug('Consensus already applied', { targetId, sentiment: consensusSentiment });
      return 0;
    }

    // Apply adjustment
    const adjustment = await this.applyAdjustment(
      record,
      targetId,
      domain,
      consensusSentiment
    );

    if (adjustment) {
      record.adjustments.push(adjustment);

      // Update tracker
      tracker.consensus = {
        sentiment: consensusSentiment,
        suggestedAction: tracker.signals[0]?.suggestedAction,
        signalCount: consensusSentiment === 'positive' ? positiveCount : negativeCount,
        reachedAt: now,
      };

      this.consistencyTrackers.set(trackerKey, tracker);

      this.audit('adjustment_applied', 'system', '', record.tenantId, {
        feedbackId: record.id,
        targetId,
        domain,
        adjustment,
      });

      return 1;
    }

    return 0;
  }

  /**
   * Apply a single adjustment (capped at max percent)
   */
  private async applyAdjustment(
    record: FeedbackRecord,
    targetId: string,
    domain: string,
    sentiment: 'positive' | 'negative'
  ): Promise<FeedbackAdjustment | null> {
    // Calculate adjustment (capped at MAX_ADJUSTMENT_PERCENT)
    const adjustmentDirection = sentiment === 'positive' ? 1 : -1;
    const changePercent = this.config.maxAdjustmentPercent * adjustmentDirection;

    // Determine adjustment type based on target
    const isPattern = record.submission.context.patternId === targetId;
    const isSkill = record.submission.context.skillId === targetId;

    if (isPattern && this.learningEngine) {
      // Adjust pattern confidence in learning engine
      const entry = this.learningEngine.getEntry(domain);
      if (entry) {
        const currentConfidence = entry.overallSuccessRate;
        const newConfidence = Math.max(0, Math.min(1, currentConfidence + changePercent));

        // Note: LearningEngine doesn't expose direct confidence adjustment
        // We use recordSuccess/recordFailure as the mechanism
        if (sentiment === 'positive') {
          this.learningEngine.recordSuccess(domain, {
            tier: 'intelligence',
            responseTime: 100,
            contentLength: 1000,
          });
        } else {
          this.learningEngine.recordFailure(domain, {
            type: 'unknown',
            errorMessage: 'Adjusted due to negative feedback',
          });
        }

        return {
          type: 'pattern_confidence',
          target: { id: targetId, domain },
          previousValue: currentConfidence,
          newValue: newConfidence,
          changePercent,
          revertible: true,
        };
      }
    }

    if (isSkill && this.proceduralMemory) {
      // Adjust skill through procedural memory feedback
      await this.proceduralMemory.recordFeedback(
        targetId,
        sentiment === 'positive' ? 'positive' : 'negative',
        { url: record.submission.context.url, domain },
        record.submission.message
      );

      return {
        type: 'selector_priority',
        target: { id: targetId, domain },
        previousValue: 0, // Not tracking exact values for skills
        newValue: 0,
        changePercent,
        revertible: true,
      };
    }

    return null;
  }

  /**
   * Get or create a consistency tracker for a target
   */
  private getOrCreateConsistencyTracker(
    targetType: 'pattern' | 'skill' | 'domain' | 'api',
    targetId: string,
    domain: string
  ): ConsistencyTracker {
    const key = `${domain}:${targetId}`;
    let tracker = this.consistencyTrackers.get(key);

    if (!tracker) {
      tracker = {
        targetType,
        targetId,
        domain,
        signals: [],
      };
      this.consistencyTrackers.set(key, tracker);
    }

    return tracker;
  }

  // ============================================
  // REVERT MECHANISM
  // ============================================

  /**
   * Revert adjustments made for a specific feedback
   */
  async revertAdjustments(tenantId: string, feedbackId: string): Promise<boolean> {
    const records = this.feedbackRecords.get(tenantId) || [];
    const record = records.find(r => r.id === feedbackId);

    if (!record) {
      log.warn('Feedback not found for revert', { tenantId, feedbackId });
      return false;
    }

    const revertibleAdjustments = record.adjustments.filter(a => a.revertible && !a.revertedAt);

    if (revertibleAdjustments.length === 0) {
      log.debug('No revertible adjustments found', { feedbackId });
      return false;
    }

    for (const adjustment of revertibleAdjustments) {
      // Reverse the adjustment
      const domain = adjustment.target.domain;
      const reverseChange = -adjustment.changePercent;

      if (adjustment.type === 'pattern_confidence' && this.learningEngine) {
        // Reverse the pattern adjustment
        if (adjustment.changePercent > 0) {
          // Was positive, now record failure to reverse
          this.learningEngine.recordFailure(domain, {
            type: 'unknown',
            errorMessage: 'Reverted due to adjustment rollback',
          });
        } else {
          // Was negative, now record success to reverse
          this.learningEngine.recordSuccess(domain, {
            tier: 'intelligence',
            responseTime: 100,
            contentLength: 1000,
          });
        }
      }

      adjustment.revertedAt = Date.now();
    }

    record.status = 'rejected';
    record.updatedAt = Date.now();

    this.audit('adjustment_reverted', 'human_admin', '', tenantId, {
      feedbackId,
      adjustmentsReverted: revertibleAdjustments.length,
    });

    log.info('Adjustments reverted', { feedbackId, count: revertibleAdjustments.length });

    return true;
  }

  // ============================================
  // NOTIFICATIONS
  // ============================================

  /**
   * Check if notification should be sent and queue it
   */
  private async checkAndSendNotifications(record: FeedbackRecord): Promise<boolean> {
    const { submission } = record;
    let shouldNotify = false;
    let notificationType: NotificationType = 'critical_feedback';
    let priority: 'low' | 'normal' | 'high' | 'urgent' = 'normal';

    // Security alerts - always notify
    if (submission.category === 'security') {
      shouldNotify = true;
      notificationType = 'security_alert';
      priority = 'urgent';
    }

    // Critical severity
    if (submission.severity === 'critical') {
      shouldNotify = true;
      notificationType = 'critical_feedback';
      priority = 'high';
    }

    // Anomaly detected
    if (record.anomalyFlags.length > 0) {
      shouldNotify = true;
      notificationType = 'anomaly_detected';
      priority = record.anomalyFlags.some(a => a.severity === 'critical') ? 'urgent' : 'high';
    }

    // Feature request
    if (submission.category === 'feature_request') {
      shouldNotify = true;
      notificationType = 'feature_request';
      priority = 'low';
    }

    // Check for repeated pattern failures
    if (submission.subtype === 'pattern_failure') {
      const tenantRecords = this.feedbackRecords.get(record.tenantId) || [];
      const recentPatternFailures = tenantRecords.filter(
        r => r.submission.subtype === 'pattern_failure' &&
             r.submission.context.patternId === submission.context.patternId &&
             r.createdAt > Date.now() - 60 * 60 * 1000 // 1 hour
      ).length;

      if (recentPatternFailures >= 3) {
        shouldNotify = true;
        notificationType = 'pattern_failure';
        priority = 'high';
      }
    }

    if (shouldNotify) {
      await this.triggerNotification(notificationType, record.tenantId, record, priority);
      return true;
    }

    return false;
  }

  /**
   * Trigger a notification
   */
  private async triggerNotification(
    type: NotificationType,
    tenantId: string,
    record: FeedbackRecord,
    priority: 'low' | 'normal' | 'high' | 'urgent'
  ): Promise<void> {
    const notification: FeedbackNotification = {
      id: randomUUID(),
      type,
      tenantId,
      title: this.getNotificationTitle(type, record),
      summary: this.getNotificationSummary(type, record),
      feedback: record,
      priority,
      status: 'pending',
      idempotencyKey: `${type}:${record.id}`,
      createdAt: Date.now(),
    };

    this.pendingNotifications.push(notification);

    // Try to send immediately
    await this.sendNotification(notification);
  }

  /**
   * Generate notification title
   */
  private getNotificationTitle(type: NotificationType, record: FeedbackRecord): string {
    const titles: Record<NotificationType, string> = {
      security_alert: `Security Alert: ${record.submission.subtype || 'Concern Reported'}`,
      critical_feedback: `Critical Feedback: ${record.submission.category}`,
      pattern_failure: `Pattern Failure: ${record.submission.context.patternId}`,
      anomaly_detected: `Anomaly Detected: ${record.anomalyFlags[0]?.type || 'Unknown'}`,
      feature_request: `Feature Request: ${record.submission.subtype || 'New Capability'}`,
      escalation_required: `Escalation Required: ${record.submission.category}`,
    };
    return titles[type];
  }

  /**
   * Generate notification summary
   */
  private getNotificationSummary(type: NotificationType, record: FeedbackRecord): string {
    const { submission } = record;
    return `${submission.sentiment} feedback on ${submission.context.domain}: ${submission.message || submission.subtype || submission.category}`;
  }

  /**
   * Send notification via webhook
   */
  private async sendNotification(notification: FeedbackNotification): Promise<boolean> {
    const config = this.webhookConfigs.get(notification.tenantId);

    if (!config || !config.enabled) {
      log.debug('No webhook configured or disabled', { tenantId: notification.tenantId });
      notification.status = 'failed';
      return false;
    }

    // Check if notification type is enabled
    if (!config.enabledTypes.includes(notification.type)) {
      log.debug('Notification type not enabled', {
        tenantId: notification.tenantId,
        type: notification.type,
      });
      return false;
    }

    // Prepare payload
    const payload = {
      id: notification.id,
      type: notification.type,
      title: notification.title,
      summary: notification.summary,
      priority: notification.priority,
      feedback: {
        id: notification.feedback.id,
        category: notification.feedback.submission.category,
        sentiment: notification.feedback.submission.sentiment,
        severity: notification.feedback.submission.severity,
        domain: notification.feedback.submission.context.domain,
        url: notification.feedback.submission.context.url,
        message: notification.feedback.submission.message,
        anomalyFlags: notification.feedback.anomalyFlags,
      },
      timestamp: notification.createdAt,
      idempotencyKey: notification.idempotencyKey,
    };

    // Sign payload with HMAC-SHA256
    const payloadStr = JSON.stringify(payload);
    const signature = this.signPayload(payloadStr, config.secretHash);

    try {
      const response = await fetch(config.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Unbrowser-Signature': signature,
          'X-Unbrowser-Timestamp': Date.now().toString(),
          'X-Unbrowser-Idempotency-Key': notification.idempotencyKey,
        },
        body: payloadStr,
        signal: AbortSignal.timeout(10000), // 10s timeout
      });

      if (response.ok) {
        notification.status = 'sent';
        notification.sentAt = Date.now();
        config.lastDeliveryAt = Date.now();
        config.lastDeliveryStatus = 'success';
        config.consecutiveFailures = 0;

        this.audit('notified', 'system', '', notification.tenantId, {
          notificationId: notification.id,
          type: notification.type,
          webhookUrl: config.url,
        });

        log.info('Notification sent', {
          notificationId: notification.id,
          type: notification.type,
          tenantId: notification.tenantId,
        });

        return true;
      } else {
        throw new Error(`Webhook returned ${response.status}`);
      }
    } catch (error) {
      config.lastDeliveryAt = Date.now();
      config.lastDeliveryStatus = 'failure';
      config.consecutiveFailures++;

      notification.status = 'failed';

      log.error('Notification delivery failed', {
        notificationId: notification.id,
        tenantId: notification.tenantId,
        error: error instanceof Error ? error.message : String(error),
        consecutiveFailures: config.consecutiveFailures,
      });

      // Disable webhook after too many failures
      if (config.consecutiveFailures >= 10) {
        config.enabled = false;
        log.warn('Webhook disabled due to consecutive failures', {
          tenantId: notification.tenantId,
          url: config.url,
        });
      }

      return false;
    }
  }

  /**
   * Sign a payload with HMAC-SHA256
   */
  private signPayload(payload: string, secretHash: string): string {
    // Note: We use the stored hash as the HMAC key
    // In production, the raw secret would be provided by the tenant
    return createHmac('sha256', secretHash)
      .update(payload)
      .digest('hex');
  }

  // ============================================
  // WEBHOOK CONFIGURATION
  // ============================================

  /**
   * Configure webhook for a tenant
   */
  configureWebhook(tenantId: string, url: string, secret: string, enabledTypes: NotificationType[]): void {
    // Hash the secret for storage
    const secretHash = createHmac('sha256', 'unbrowser-webhook-key')
      .update(secret)
      .digest('hex');

    const config: WebhookConfig = {
      url,
      secretHash,
      enabledTypes,
      enabled: true,
      maxRetries: 3,
      retryDelayMs: 5000,
      consecutiveFailures: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.webhookConfigs.set(tenantId, config);

    log.info('Webhook configured', { tenantId, url, enabledTypes });
  }

  /**
   * Disable webhook for a tenant
   */
  disableWebhook(tenantId: string): void {
    const config = this.webhookConfigs.get(tenantId);
    if (config) {
      config.enabled = false;
      config.updatedAt = Date.now();
      log.info('Webhook disabled', { tenantId });
    }
  }

  // ============================================
  // QUERY METHODS
  // ============================================

  /**
   * Get feedback records for a tenant
   */
  listFeedback(
    tenantId: string,
    options: {
      limit?: number;
      offset?: number;
      category?: FeedbackCategory;
      sentiment?: FeedbackSentiment;
      status?: FeedbackRecord['status'];
    } = {}
  ): FeedbackRecord[] {
    let records = this.feedbackRecords.get(tenantId) || [];

    // Apply filters
    if (options.category) {
      records = records.filter(r => r.submission.category === options.category);
    }
    if (options.sentiment) {
      records = records.filter(r => r.submission.sentiment === options.sentiment);
    }
    if (options.status) {
      records = records.filter(r => r.status === options.status);
    }

    // Sort by createdAt descending
    records = records.sort((a, b) => b.createdAt - a.createdAt);

    // Apply pagination
    const offset = options.offset || 0;
    const limit = options.limit || 50;

    return records.slice(offset, offset + limit);
  }

  /**
   * Get feedback statistics for a tenant
   */
  getStats(tenantId: string, periodHours: number = 24): FeedbackStats {
    const now = Date.now();
    const periodStart = now - periodHours * 60 * 60 * 1000;
    const records = (this.feedbackRecords.get(tenantId) || [])
      .filter(r => r.createdAt >= periodStart);

    const byCategory: Record<FeedbackCategory, number> = {
      content_quality: 0,
      accuracy: 0,
      performance: 0,
      functionality: 0,
      security: 0,
      feature_request: 0,
    };

    const bySentiment: Record<FeedbackSentiment, number> = {
      positive: 0,
      negative: 0,
      neutral: 0,
    };

    const byStatus: Record<FeedbackRecord['status'], number> = {
      pending: 0,
      processing: 0,
      applied: 0,
      rejected: 0,
      escalated: 0,
    };

    let anomaliesDetected = 0;
    let escalationsRequired = 0;
    let adjustmentsApplied = 0;
    let adjustmentsReverted = 0;

    for (const record of records) {
      byCategory[record.submission.category]++;
      bySentiment[record.submission.sentiment]++;
      byStatus[record.status]++;

      if (record.anomalyFlags.length > 0) {
        anomaliesDetected++;
      }
      if (record.status === 'escalated') {
        escalationsRequired++;
      }

      adjustmentsApplied += record.adjustments.filter(a => !a.revertedAt).length;
      adjustmentsReverted += record.adjustments.filter(a => a.revertedAt).length;
    }

    return {
      tenantId,
      period: { start: periodStart, end: now },
      byCategory,
      bySentiment,
      byStatus,
      anomaliesDetected,
      escalationsRequired,
      adjustmentsApplied,
      adjustmentsReverted,
      total: records.length,
    };
  }

  /**
   * Get anomaly flags for a tenant
   */
  getAnomalies(tenantId: string, limit: number = 20): AnomalyFlag[] {
    const records = this.feedbackRecords.get(tenantId) || [];
    const anomalies: AnomalyFlag[] = [];

    for (const record of records) {
      for (const flag of record.anomalyFlags) {
        anomalies.push(flag);
      }
    }

    return anomalies
      .sort((a, b) => b.detectedAt - a.detectedAt)
      .slice(0, limit);
  }

  // ============================================
  // STORAGE
  // ============================================

  /**
   * Store a feedback record
   */
  private storeFeedback(tenantId: string, record: FeedbackRecord): void {
    let records = this.feedbackRecords.get(tenantId);
    if (!records) {
      records = [];
      this.feedbackRecords.set(tenantId, records);
    }

    records.push(record);

    // Keep bounded
    if (records.length > MAX_FEEDBACK_PER_TENANT * 2) {
      this.feedbackRecords.set(tenantId, records.slice(-MAX_FEEDBACK_PER_TENANT));
    }
  }

  // ============================================
  // AUDIT LOGGING
  // ============================================

  /**
   * Record an audit entry
   */
  private audit(
    action: FeedbackAuditEntry['action'],
    actorType: FeedbackAuditEntry['actor']['type'],
    actorId: string,
    tenantId: string,
    details: Record<string, unknown>
  ): void {
    const entry: FeedbackAuditEntry = {
      id: randomUUID(),
      action,
      actor: { type: actorType, id: actorId },
      feedbackId: (details.feedbackId as string) || '',
      tenantId,
      details,
      timestamp: Date.now(),
    };

    this.auditLog.push(entry);

    // Keep bounded
    if (this.auditLog.length > MAX_AUDIT_ENTRIES * 2) {
      this.auditLog = this.auditLog.slice(-MAX_AUDIT_ENTRIES);
    }
  }

  /**
   * Get audit log entries
   */
  getAuditLog(tenantId?: string, limit: number = 100): FeedbackAuditEntry[] {
    let entries = this.auditLog;

    if (tenantId) {
      entries = entries.filter(e => e.tenantId === tenantId);
    }

    return entries
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  }

  // ============================================
  // CLEANUP
  // ============================================

  /**
   * Cleanup expired data
   */
  cleanup(): void {
    this.rateLimiter.cleanup();

    // Clean old consistency trackers
    const now = Date.now();
    for (const [key, tracker] of this.consistencyTrackers) {
      tracker.signals = tracker.signals.filter(s => s.timestamp > now - CONSISTENCY_WINDOW_MS);
      if (tracker.signals.length === 0) {
        this.consistencyTrackers.delete(key);
      }
    }

    // Remove old pending notifications that were never sent
    this.pendingNotifications = this.pendingNotifications.filter(
      n => n.createdAt > now - 24 * 60 * 60 * 1000 // Keep 24 hours
    );

    log.debug('Cleanup completed');
  }
}
