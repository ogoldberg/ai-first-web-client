/**
 * Webhook Notification Types (F-011)
 *
 * Type definitions and Zod validation schemas for the general-purpose webhook
 * notification system that enables external integrations.
 *
 * Features:
 * - Multiple event types (browse, content_change, pattern, error, feedback)
 * - HMAC-SHA256 signature verification
 * - Retry with exponential backoff
 * - Event filtering by type and domain
 * - Delivery tracking and health monitoring
 */

import { z } from 'zod';

// ============================================
// WEBHOOK EVENT TYPES
// ============================================

/**
 * Categories of webhook events
 */
export type WebhookEventCategory =
  | 'browse'          // Browse operation events
  | 'content_change'  // Content monitoring alerts
  | 'pattern'         // Learning system events
  | 'error'           // Error and failure events
  | 'feedback'        // Feedback system events
  | 'system';         // System status events

export const WebhookEventCategorySchema = z.enum([
  'browse',
  'content_change',
  'pattern',
  'error',
  'feedback',
  'system',
]);

/**
 * Specific event types within each category
 */
export type WebhookEventType =
  // Browse events
  | 'browse.completed'       // Browse operation finished
  | 'browse.failed'          // Browse operation failed
  | 'browse.tier_escalation' // Tier escalation occurred
  // Content change events
  | 'content_change.detected'  // Content changed on tracked URL
  | 'content_change.significant' // Significant change detected
  // Pattern events
  | 'pattern.discovered'     // New API pattern discovered
  | 'pattern.failed'         // Pattern stopped working
  | 'pattern.updated'        // Pattern confidence updated
  // Error events
  | 'error.rate_limit'       // Rate limit encountered
  | 'error.bot_detected'     // Bot detection triggered
  | 'error.timeout'          // Request timeout
  | 'error.auth_failure'     // Authentication failed
  // Feedback events
  | 'feedback.submitted'     // New feedback submitted
  | 'feedback.escalated'     // Feedback requires review
  | 'feedback.anomaly'       // Anomaly detected in feedback
  // System events
  | 'system.health'          // Health status update
  | 'system.quota_warning'   // Approaching quota limit
  | 'system.maintenance';    // Scheduled maintenance

export const WebhookEventTypeSchema = z.enum([
  'browse.completed',
  'browse.failed',
  'browse.tier_escalation',
  'content_change.detected',
  'content_change.significant',
  'pattern.discovered',
  'pattern.failed',
  'pattern.updated',
  'error.rate_limit',
  'error.bot_detected',
  'error.timeout',
  'error.auth_failure',
  'feedback.submitted',
  'feedback.escalated',
  'feedback.anomaly',
  'system.health',
  'system.quota_warning',
  'system.maintenance',
]);

// ============================================
// WEBHOOK PAYLOAD
// ============================================

/**
 * Base payload structure for all webhook events
 */
export interface WebhookPayload<T = unknown> {
  // Event identification
  id: string;
  type: WebhookEventType;
  category: WebhookEventCategory;

  // Tenant context
  tenantId: string;

  // Timestamps
  timestamp: number;
  occurredAt: number;

  // Event-specific data
  data: T;

  // Metadata for filtering
  metadata: {
    domain?: string;
    url?: string;
    requestId?: string;
    severity?: 'low' | 'medium' | 'high' | 'critical';
  };
}

/**
 * Payload data for browse events
 */
export interface BrowseEventData {
  url: string;
  finalUrl: string;
  domain: string;
  success: boolean;
  durationMs: number;
  tier: 'intelligence' | 'lightweight' | 'playwright';
  tierAttempts?: number;
  contentLength?: number;
  error?: string;
}

/**
 * Payload data for content change events
 */
export interface ContentChangeEventData {
  url: string;
  domain: string;
  changeType: 'minor' | 'moderate' | 'significant' | 'major';
  changePercent: number;
  previousCheckAt: number;
  summary?: string;
  sectionsChanged?: string[];
}

/**
 * Payload data for pattern events
 */
export interface PatternEventData {
  patternId: string;
  patternType: string;
  domain: string;
  action: 'discovered' | 'failed' | 'updated';
  confidence?: number;
  previousConfidence?: number;
  reason?: string;
}

/**
 * Payload data for error events
 */
export interface ErrorEventData {
  url: string;
  domain: string;
  errorType: string;
  errorCode?: string;
  message: string;
  recoverable: boolean;
  suggestedAction?: string;
}

/**
 * Payload data for feedback events
 */
export interface FeedbackEventData {
  feedbackId: string;
  category: string;
  sentiment: string;
  severity?: string;
  domain: string;
  url: string;
  message?: string;
  status: string;
}

/**
 * Payload data for system events
 */
export interface SystemEventData {
  eventType: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  message: string;
  details?: Record<string, unknown>;
}

// ============================================
// WEBHOOK ENDPOINT CONFIGURATION
// ============================================

/**
 * Configuration for a webhook endpoint
 */
export interface WebhookEndpoint {
  // Unique identifier
  id: string;

  // Tenant that owns this endpoint
  tenantId: string;

  // Display name
  name: string;
  description?: string;

  // Target URL
  url: string;

  // Secret for HMAC signing (stored securely)
  secret: string;

  // Event filtering
  enabledEvents: WebhookEventType[];
  enabledCategories?: WebhookEventCategory[];

  // Domain filtering (optional - if set, only events for these domains)
  domainFilter?: string[];

  // Severity filtering (optional - only events at or above this severity)
  minSeverity?: 'low' | 'medium' | 'high' | 'critical';

  // Status
  enabled: boolean;

  // Retry configuration
  maxRetries: number;
  initialRetryDelayMs: number;
  maxRetryDelayMs: number;

  // Custom headers (for auth, etc.)
  headers?: Record<string, string>;

  // Health tracking
  health: WebhookHealth;

  // Timestamps
  createdAt: number;
  updatedAt: number;
}

/**
 * Health status of a webhook endpoint
 */
export interface WebhookHealth {
  // Current status
  status: 'healthy' | 'degraded' | 'unhealthy';

  // Delivery statistics
  totalDeliveries: number;
  successfulDeliveries: number;
  failedDeliveries: number;

  // Recent history
  consecutiveFailures: number;
  lastDeliveryAt?: number;
  lastDeliveryStatus?: 'success' | 'failure';
  lastErrorMessage?: string;

  // Response time tracking
  avgResponseTimeMs?: number;

  // Circuit breaker timestamp (when circuit was opened)
  // Used for timestamp-based reset instead of setTimeout for restart resilience
  circuitOpenedAt?: number;
}

// ============================================
// WEBHOOK DELIVERY
// ============================================

/**
 * Record of a webhook delivery attempt
 */
export interface WebhookDelivery {
  // Unique delivery ID
  id: string;

  // Which endpoint and event
  endpointId: string;
  eventId: string;
  eventType: WebhookEventType;

  // Delivery status
  status: 'pending' | 'success' | 'failed' | 'retrying';

  // Attempt tracking
  attempts: number;
  maxAttempts: number;
  nextRetryAt?: number;

  // Response details
  responseStatus?: number;
  responseTimeMs?: number;
  errorMessage?: string;

  // For idempotency
  idempotencyKey: string;

  // Timestamps
  createdAt: number;
  completedAt?: number;
}

// ============================================
// INPUT SCHEMAS (ZOD)
// ============================================

/**
 * Zod schema for creating/updating a webhook endpoint
 */
export const WebhookEndpointInputSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  url: z.string().url().max(2048),
  secret: z.string().min(32).max(256),
  enabledEvents: z.array(WebhookEventTypeSchema).min(1),
  enabledCategories: z.array(WebhookEventCategorySchema).optional(),
  domainFilter: z.array(z.string().max(253)).max(100).optional(),
  minSeverity: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  enabled: z.boolean().default(true),
  maxRetries: z.number().int().min(0).max(10).default(3),
  initialRetryDelayMs: z.number().int().min(1000).max(60000).default(1000),
  maxRetryDelayMs: z.number().int().min(5000).max(300000).default(60000),
  headers: z.record(z.string(), z.string().max(1000)).optional(),
});

export type WebhookEndpointInput = z.infer<typeof WebhookEndpointInputSchema>;

/**
 * Zod schema for updating a webhook endpoint
 */
export const WebhookEndpointUpdateSchema = WebhookEndpointInputSchema.partial().extend({
  // Secret is optional on update (keep existing if not provided)
  secret: z.string().min(32).max(256).optional(),
});

export type WebhookEndpointUpdate = z.infer<typeof WebhookEndpointUpdateSchema>;

// ============================================
// SERVICE RESPONSE TYPES
// ============================================

/**
 * Result of sending a webhook
 */
export interface WebhookSendResult {
  success: boolean;
  deliveryId: string;
  endpointId: string;
  eventId: string;
  attempts: number;
  responseStatus?: number;
  responseTimeMs?: number;
  error?: string;
  willRetry?: boolean;
  nextRetryAt?: number;
}

/**
 * Result of testing a webhook endpoint
 */
export interface WebhookTestResult {
  success: boolean;
  endpointId: string;
  responseStatus?: number;
  responseTimeMs?: number;
  error?: string;
  signatureVerified: boolean;
}

/**
 * Statistics for webhook deliveries
 */
export interface WebhookStats {
  tenantId: string;
  period: {
    start: number;
    end: number;
  };

  // Delivery stats
  totalEvents: number;
  totalDeliveries: number;
  successfulDeliveries: number;
  failedDeliveries: number;
  pendingDeliveries: number;

  // By event type
  byEventType: Record<string, number>;

  // By endpoint
  byEndpoint: Array<{
    endpointId: string;
    name: string;
    total: number;
    successful: number;
    failed: number;
    health: WebhookHealth['status'];
  }>;

  // Performance
  avgResponseTimeMs: number;
  p95ResponseTimeMs: number;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Get the category from an event type
 */
export function getEventCategory(eventType: WebhookEventType): WebhookEventCategory {
  const [category] = eventType.split('.') as [WebhookEventCategory];
  return category;
}

/**
 * Create default webhook health
 */
export function createDefaultHealth(): WebhookHealth {
  return {
    status: 'healthy',
    totalDeliveries: 0,
    successfulDeliveries: 0,
    failedDeliveries: 0,
    consecutiveFailures: 0,
  };
}

/**
 * Severity levels for filtering
 */
export type SeverityLevel = 'low' | 'medium' | 'high' | 'critical';

/**
 * Severity priority order (for filtering)
 */
export const SEVERITY_PRIORITY: Record<SeverityLevel, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

/**
 * Check if a string is a valid severity level
 */
function isSeverityLevel(value: string): value is SeverityLevel {
  return value in SEVERITY_PRIORITY;
}

/**
 * Check if an event meets severity threshold
 */
export function meetsSeverityThreshold(
  eventSeverity: string | undefined,
  minSeverity: string | undefined
): boolean {
  if (!minSeverity) return true;
  if (!eventSeverity) return true; // No severity = include by default
  if (!isSeverityLevel(eventSeverity) || !isSeverityLevel(minSeverity)) {
    return true; // Unknown severity = include by default
  }
  return SEVERITY_PRIORITY[eventSeverity] >= SEVERITY_PRIORITY[minSeverity];
}
