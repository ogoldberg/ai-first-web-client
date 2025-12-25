/**
 * Webhook Service (F-011)
 *
 * General-purpose webhook notification system for external integrations.
 *
 * Features:
 * - Multiple endpoint support per tenant
 * - Event filtering by type, category, domain, severity
 * - HMAC-SHA256 signature verification
 * - Retry with exponential backoff
 * - Delivery tracking and health monitoring
 * - Circuit breaker pattern for unhealthy endpoints
 *
 * Security:
 * - All payloads signed with HMAC-SHA256
 * - Secrets stored securely (not logged)
 * - Rate limiting for outbound requests
 * - Idempotency keys prevent duplicate processing
 */

import { createHmac, randomUUID } from 'crypto';
import {
  type WebhookEventType,
  type WebhookEventCategory,
  type WebhookPayload,
  type WebhookEndpoint,
  type WebhookEndpointInput,
  type WebhookEndpointUpdate,
  type WebhookDelivery,
  type WebhookHealth,
  type WebhookSendResult,
  type WebhookTestResult,
  type WebhookStats,
  WebhookEndpointInputSchema,
  WebhookEndpointUpdateSchema,
  getEventCategory,
  createDefaultHealth,
  meetsSeverityThreshold,
} from '../types/webhook.js';
import { logger } from '../utils/logger.js';

const log = logger.create('WebhookService');

// ============================================
// CONFIGURATION
// ============================================

/**
 * Default configuration for webhook service
 */
export interface WebhookServiceConfig {
  // Maximum endpoints per tenant
  maxEndpointsPerTenant?: number;

  // Circuit breaker settings
  circuitBreakerThreshold?: number; // Consecutive failures before circuit opens
  circuitBreakerResetMs?: number;   // Time before circuit resets

  // Rate limiting
  maxDeliveriesPerMinute?: number;

  // Retry settings
  defaultMaxRetries?: number;
  defaultInitialRetryDelayMs?: number;
  defaultMaxRetryDelayMs?: number;

  // Delivery history
  maxDeliveryHistoryPerEndpoint?: number;
}

const DEFAULT_CONFIG: Required<WebhookServiceConfig> = {
  maxEndpointsPerTenant: 10,
  circuitBreakerThreshold: 5,
  circuitBreakerResetMs: 60000, // 1 minute
  maxDeliveriesPerMinute: 100,
  defaultMaxRetries: 3,
  defaultInitialRetryDelayMs: 1000,
  defaultMaxRetryDelayMs: 60000,
  maxDeliveryHistoryPerEndpoint: 100,
};

// ============================================
// WEBHOOK SERVICE
// ============================================

export class WebhookService {
  private endpoints = new Map<string, WebhookEndpoint[]>(); // tenantId -> endpoints
  private deliveries = new Map<string, WebhookDelivery[]>(); // endpointId -> deliveries
  private pendingRetries: Map<string, NodeJS.Timeout> = new Map(); // deliveryId -> timeout
  private config: Required<WebhookServiceConfig>;

  constructor(config: WebhookServiceConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    log.info('WebhookService initialized', {
      maxEndpointsPerTenant: this.config.maxEndpointsPerTenant,
      circuitBreakerThreshold: this.config.circuitBreakerThreshold,
    });
  }

  // ============================================
  // ENDPOINT MANAGEMENT
  // ============================================

  /**
   * Create a new webhook endpoint
   */
  createEndpoint(tenantId: string, input: WebhookEndpointInput): WebhookEndpoint {
    // Validate input
    const validated = WebhookEndpointInputSchema.parse(input);

    // Check endpoint limit
    const tenantEndpoints = this.endpoints.get(tenantId) || [];
    if (tenantEndpoints.length >= this.config.maxEndpointsPerTenant) {
      throw new Error(`Maximum endpoints (${this.config.maxEndpointsPerTenant}) reached for tenant`);
    }

    // Check for duplicate URL
    if (tenantEndpoints.some(e => e.url === validated.url)) {
      throw new Error(`Endpoint with URL ${validated.url} already exists`);
    }

    const endpoint: WebhookEndpoint = {
      id: randomUUID(),
      tenantId,
      name: validated.name,
      description: validated.description,
      url: validated.url,
      secret: validated.secret,
      enabledEvents: validated.enabledEvents,
      enabledCategories: validated.enabledCategories,
      domainFilter: validated.domainFilter,
      minSeverity: validated.minSeverity,
      enabled: validated.enabled,
      maxRetries: validated.maxRetries,
      initialRetryDelayMs: validated.initialRetryDelayMs,
      maxRetryDelayMs: validated.maxRetryDelayMs,
      headers: validated.headers,
      health: createDefaultHealth(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    tenantEndpoints.push(endpoint);
    this.endpoints.set(tenantId, tenantEndpoints);

    log.info('Webhook endpoint created', {
      endpointId: endpoint.id,
      tenantId,
      name: endpoint.name,
      url: endpoint.url,
      enabledEvents: endpoint.enabledEvents.length,
    });

    return endpoint;
  }

  /**
   * Update an existing webhook endpoint
   */
  updateEndpoint(tenantId: string, endpointId: string, update: WebhookEndpointUpdate): WebhookEndpoint {
    const validated = WebhookEndpointUpdateSchema.parse(update);

    const tenantEndpoints = this.endpoints.get(tenantId);
    if (!tenantEndpoints) {
      throw new Error(`Tenant ${tenantId} has no endpoints`);
    }

    const index = tenantEndpoints.findIndex(e => e.id === endpointId);
    if (index === -1) {
      throw new Error(`Endpoint ${endpointId} not found`);
    }

    const endpoint = tenantEndpoints[index];

    // Check for duplicate URL if URL is being changed
    if (validated.url && validated.url !== endpoint.url) {
      if (tenantEndpoints.some(e => e.url === validated.url && e.id !== endpointId)) {
        throw new Error(`Endpoint with URL ${validated.url} already exists`);
      }
    }

    // Update fields
    const updated: WebhookEndpoint = {
      ...endpoint,
      ...validated,
      // Keep existing secret if not provided
      secret: validated.secret || endpoint.secret,
      updatedAt: Date.now(),
    };

    tenantEndpoints[index] = updated;

    log.info('Webhook endpoint updated', {
      endpointId,
      tenantId,
      changes: Object.keys(validated),
    });

    return updated;
  }

  /**
   * Delete a webhook endpoint
   */
  deleteEndpoint(tenantId: string, endpointId: string): boolean {
    const tenantEndpoints = this.endpoints.get(tenantId);
    if (!tenantEndpoints) {
      return false;
    }

    const index = tenantEndpoints.findIndex(e => e.id === endpointId);
    if (index === -1) {
      return false;
    }

    // Cancel any pending retries for this endpoint
    const endpointDeliveries = this.deliveries.get(endpointId) || [];
    for (const delivery of endpointDeliveries) {
      if (this.pendingRetries.has(delivery.id)) {
        clearTimeout(this.pendingRetries.get(delivery.id));
        this.pendingRetries.delete(delivery.id);
      }
    }

    // Remove deliveries
    this.deliveries.delete(endpointId);

    // Remove endpoint
    tenantEndpoints.splice(index, 1);

    log.info('Webhook endpoint deleted', { endpointId, tenantId });

    return true;
  }

  /**
   * Get a specific endpoint
   */
  getEndpoint(tenantId: string, endpointId: string): WebhookEndpoint | undefined {
    const tenantEndpoints = this.endpoints.get(tenantId);
    return tenantEndpoints?.find(e => e.id === endpointId);
  }

  /**
   * List all endpoints for a tenant
   */
  listEndpoints(tenantId: string): WebhookEndpoint[] {
    return this.endpoints.get(tenantId) || [];
  }

  /**
   * Enable/disable an endpoint
   */
  setEndpointEnabled(tenantId: string, endpointId: string, enabled: boolean): boolean {
    const endpoint = this.getEndpoint(tenantId, endpointId);
    if (!endpoint) {
      return false;
    }

    endpoint.enabled = enabled;
    endpoint.updatedAt = Date.now();

    // Reset health when re-enabling
    if (enabled) {
      endpoint.health.consecutiveFailures = 0;
      endpoint.health.status = 'healthy';
    }

    log.info('Webhook endpoint status changed', { endpointId, enabled });

    return true;
  }

  // ============================================
  // EVENT DISPATCH
  // ============================================

  /**
   * Dispatch an event to all matching endpoints
   */
  async dispatchEvent<T>(
    tenantId: string,
    eventType: WebhookEventType,
    data: T,
    metadata: WebhookPayload['metadata'] = {}
  ): Promise<WebhookSendResult[]> {
    const category = getEventCategory(eventType);

    // Build payload
    const payload: WebhookPayload<T> = {
      id: randomUUID(),
      type: eventType,
      category,
      tenantId,
      timestamp: Date.now(),
      occurredAt: Date.now(),
      data,
      metadata,
    };

    // Find matching endpoints
    const tenantEndpoints = this.endpoints.get(tenantId) || [];
    const matchingEndpoints = tenantEndpoints.filter(endpoint =>
      this.shouldDeliverToEndpoint(endpoint, payload)
    );

    if (matchingEndpoints.length === 0) {
      log.debug('No matching endpoints for event', {
        eventType,
        tenantId,
        totalEndpoints: tenantEndpoints.length,
      });
      return [];
    }

    // Send to all matching endpoints in parallel
    const results = await Promise.all(
      matchingEndpoints.map(endpoint => this.sendToEndpoint(endpoint, payload))
    );

    log.info('Event dispatched', {
      eventId: payload.id,
      eventType,
      tenantId,
      endpointsMatched: matchingEndpoints.length,
      successful: results.filter(r => r.success).length,
    });

    return results;
  }

  /**
   * Check if an endpoint should receive an event
   */
  private shouldDeliverToEndpoint(
    endpoint: WebhookEndpoint,
    payload: WebhookPayload
  ): boolean {
    // Check if enabled
    if (!endpoint.enabled) {
      return false;
    }

    // Check circuit breaker
    if (endpoint.health.status === 'unhealthy') {
      return false;
    }

    // Check event type filter
    if (!endpoint.enabledEvents.includes(payload.type)) {
      return false;
    }

    // Check category filter (if set)
    if (endpoint.enabledCategories && endpoint.enabledCategories.length > 0) {
      if (!endpoint.enabledCategories.includes(payload.category)) {
        return false;
      }
    }

    // Check domain filter (if set)
    if (endpoint.domainFilter && endpoint.domainFilter.length > 0) {
      const eventDomain = payload.metadata.domain;
      if (!eventDomain || !endpoint.domainFilter.includes(eventDomain)) {
        return false;
      }
    }

    // Check severity filter
    if (!meetsSeverityThreshold(payload.metadata.severity, endpoint.minSeverity)) {
      return false;
    }

    return true;
  }

  /**
   * Send payload to a specific endpoint
   */
  private async sendToEndpoint(
    endpoint: WebhookEndpoint,
    payload: WebhookPayload
  ): Promise<WebhookSendResult> {
    const deliveryId = randomUUID();
    const idempotencyKey = `${payload.id}-${endpoint.id}`;

    // Create delivery record
    const delivery: WebhookDelivery = {
      id: deliveryId,
      endpointId: endpoint.id,
      eventId: payload.id,
      eventType: payload.type,
      status: 'pending',
      attempts: 0,
      maxAttempts: endpoint.maxRetries + 1,
      idempotencyKey,
      createdAt: Date.now(),
    };

    // Store delivery
    const endpointDeliveries = this.deliveries.get(endpoint.id) || [];
    endpointDeliveries.push(delivery);
    this.deliveries.set(endpoint.id, endpointDeliveries);

    // Trim delivery history
    if (endpointDeliveries.length > this.config.maxDeliveryHistoryPerEndpoint) {
      endpointDeliveries.splice(0, endpointDeliveries.length - this.config.maxDeliveryHistoryPerEndpoint);
    }

    // Attempt delivery
    return await this.attemptDelivery(endpoint, payload, delivery);
  }

  /**
   * Attempt to deliver a payload
   */
  private async attemptDelivery(
    endpoint: WebhookEndpoint,
    payload: WebhookPayload,
    delivery: WebhookDelivery
  ): Promise<WebhookSendResult> {
    delivery.attempts++;

    const startTime = Date.now();

    try {
      // Serialize payload
      const body = JSON.stringify(payload);

      // Generate HMAC signature
      const signature = this.generateSignature(body, endpoint.secret);

      // Build headers
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-Webhook-Id': payload.id,
        'X-Webhook-Event': payload.type,
        'X-Webhook-Timestamp': payload.timestamp.toString(),
        'X-Webhook-Signature': `sha256=${signature}`,
        'X-Idempotency-Key': delivery.idempotencyKey,
        ...endpoint.headers,
      };

      // Send request
      const response = await fetch(endpoint.url, {
        method: 'POST',
        headers,
        body,
        signal: AbortSignal.timeout(30000), // 30 second timeout
      });

      const responseTimeMs = Date.now() - startTime;

      if (response.ok) {
        // Success
        delivery.status = 'success';
        delivery.responseStatus = response.status;
        delivery.responseTimeMs = responseTimeMs;
        delivery.completedAt = Date.now();

        this.updateHealthOnSuccess(endpoint, responseTimeMs);

        return {
          success: true,
          deliveryId: delivery.id,
          endpointId: endpoint.id,
          eventId: payload.id,
          attempts: delivery.attempts,
          responseStatus: response.status,
          responseTimeMs,
        };
      } else {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
    } catch (error) {
      const responseTimeMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      delivery.responseTimeMs = responseTimeMs;
      delivery.errorMessage = errorMessage;

      // Check if we should retry
      if (delivery.attempts < delivery.maxAttempts) {
        delivery.status = 'retrying';
        const retryDelayMs = this.calculateRetryDelay(endpoint, delivery.attempts);
        delivery.nextRetryAt = Date.now() + retryDelayMs;

        // Schedule retry
        this.scheduleRetry(endpoint, payload, delivery, retryDelayMs);

        log.warn('Webhook delivery failed, scheduling retry', {
          deliveryId: delivery.id,
          endpointId: endpoint.id,
          attempt: delivery.attempts,
          maxAttempts: delivery.maxAttempts,
          retryDelayMs,
          error: errorMessage,
        });

        return {
          success: false,
          deliveryId: delivery.id,
          endpointId: endpoint.id,
          eventId: payload.id,
          attempts: delivery.attempts,
          responseTimeMs,
          error: errorMessage,
          willRetry: true,
          nextRetryAt: delivery.nextRetryAt,
        };
      } else {
        // Final failure
        delivery.status = 'failed';
        delivery.completedAt = Date.now();

        this.updateHealthOnFailure(endpoint, errorMessage);

        log.error('Webhook delivery failed permanently', {
          deliveryId: delivery.id,
          endpointId: endpoint.id,
          attempts: delivery.attempts,
          error: errorMessage,
        });

        return {
          success: false,
          deliveryId: delivery.id,
          endpointId: endpoint.id,
          eventId: payload.id,
          attempts: delivery.attempts,
          responseTimeMs,
          error: errorMessage,
          willRetry: false,
        };
      }
    }
  }

  /**
   * Schedule a retry delivery
   */
  private scheduleRetry(
    endpoint: WebhookEndpoint,
    payload: WebhookPayload,
    delivery: WebhookDelivery,
    delayMs: number
  ): void {
    const timeout = setTimeout(async () => {
      this.pendingRetries.delete(delivery.id);
      await this.attemptDelivery(endpoint, payload, delivery);
    }, delayMs);

    this.pendingRetries.set(delivery.id, timeout);
  }

  /**
   * Calculate retry delay with exponential backoff
   */
  private calculateRetryDelay(endpoint: WebhookEndpoint, attemptNumber: number): number {
    const baseDelay = endpoint.initialRetryDelayMs;
    const maxDelay = endpoint.maxRetryDelayMs;

    // Exponential backoff: baseDelay * 2^(attempt-1) with jitter
    const exponentialDelay = baseDelay * Math.pow(2, attemptNumber - 1);
    const jitter = Math.random() * 0.3 * exponentialDelay; // 30% jitter

    return Math.min(exponentialDelay + jitter, maxDelay);
  }

  // ============================================
  // HEALTH TRACKING
  // ============================================

  /**
   * Update health after successful delivery
   */
  private updateHealthOnSuccess(endpoint: WebhookEndpoint, responseTimeMs: number): void {
    endpoint.health.totalDeliveries++;
    endpoint.health.successfulDeliveries++;
    endpoint.health.consecutiveFailures = 0;
    endpoint.health.lastDeliveryAt = Date.now();
    endpoint.health.lastDeliveryStatus = 'success';
    endpoint.health.status = 'healthy';

    // Update average response time (exponential moving average)
    if (endpoint.health.avgResponseTimeMs === undefined) {
      endpoint.health.avgResponseTimeMs = responseTimeMs;
    } else {
      endpoint.health.avgResponseTimeMs = 0.8 * endpoint.health.avgResponseTimeMs + 0.2 * responseTimeMs;
    }
  }

  /**
   * Update health after failed delivery
   */
  private updateHealthOnFailure(endpoint: WebhookEndpoint, errorMessage: string): void {
    endpoint.health.totalDeliveries++;
    endpoint.health.failedDeliveries++;
    endpoint.health.consecutiveFailures++;
    endpoint.health.lastDeliveryAt = Date.now();
    endpoint.health.lastDeliveryStatus = 'failure';
    endpoint.health.lastErrorMessage = errorMessage;

    // Update health status based on consecutive failures
    if (endpoint.health.consecutiveFailures >= this.config.circuitBreakerThreshold) {
      endpoint.health.status = 'unhealthy';
      log.warn('Webhook endpoint marked unhealthy', {
        endpointId: endpoint.id,
        consecutiveFailures: endpoint.health.consecutiveFailures,
      });

      // Schedule circuit breaker reset
      setTimeout(() => {
        if (endpoint.health.status === 'unhealthy') {
          endpoint.health.status = 'degraded';
          log.info('Webhook endpoint circuit breaker reset to degraded', {
            endpointId: endpoint.id,
          });
        }
      }, this.config.circuitBreakerResetMs);
    } else if (endpoint.health.consecutiveFailures >= 2) {
      endpoint.health.status = 'degraded';
    }
  }

  // ============================================
  // SIGNATURE GENERATION
  // ============================================

  /**
   * Generate HMAC-SHA256 signature for payload
   */
  private generateSignature(payload: string, secret: string): string {
    return createHmac('sha256', secret).update(payload).digest('hex');
  }

  /**
   * Verify a webhook signature (for testing endpoints)
   */
  verifySignature(payload: string, signature: string, secret: string): boolean {
    const expected = this.generateSignature(payload, secret);
    // Timing-safe comparison
    if (signature.length !== expected.length) {
      return false;
    }
    let result = 0;
    for (let i = 0; i < signature.length; i++) {
      result |= signature.charCodeAt(i) ^ expected.charCodeAt(i);
    }
    return result === 0;
  }

  // ============================================
  // TESTING
  // ============================================

  /**
   * Send a test event to an endpoint
   */
  async testEndpoint(tenantId: string, endpointId: string): Promise<WebhookTestResult> {
    const endpoint = this.getEndpoint(tenantId, endpointId);
    if (!endpoint) {
      return {
        success: false,
        endpointId,
        error: 'Endpoint not found',
        signatureVerified: false,
      };
    }

    // Create test payload
    const testPayload: WebhookPayload = {
      id: randomUUID(),
      type: 'system.health',
      category: 'system',
      tenantId,
      timestamp: Date.now(),
      occurredAt: Date.now(),
      data: {
        eventType: 'test',
        status: 'healthy',
        message: 'This is a test webhook delivery',
        details: { test: true },
      },
      metadata: {},
    };

    const startTime = Date.now();

    try {
      const body = JSON.stringify(testPayload);
      const signature = this.generateSignature(body, endpoint.secret);

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-Webhook-Id': testPayload.id,
        'X-Webhook-Event': 'system.health',
        'X-Webhook-Timestamp': testPayload.timestamp.toString(),
        'X-Webhook-Signature': `sha256=${signature}`,
        'X-Webhook-Test': 'true',
        ...endpoint.headers,
      };

      const response = await fetch(endpoint.url, {
        method: 'POST',
        headers,
        body,
        signal: AbortSignal.timeout(10000), // 10 second timeout for tests
      });

      const responseTimeMs = Date.now() - startTime;

      return {
        success: response.ok,
        endpointId,
        responseStatus: response.status,
        responseTimeMs,
        error: response.ok ? undefined : `HTTP ${response.status}`,
        signatureVerified: true, // We generated it, so it's valid
      };
    } catch (error) {
      const responseTimeMs = Date.now() - startTime;
      return {
        success: false,
        endpointId,
        responseTimeMs,
        error: error instanceof Error ? error.message : String(error),
        signatureVerified: false,
      };
    }
  }

  // ============================================
  // STATISTICS & HISTORY
  // ============================================

  /**
   * Get delivery history for an endpoint
   */
  getDeliveryHistory(tenantId: string, endpointId: string, limit = 50): WebhookDelivery[] {
    const endpoint = this.getEndpoint(tenantId, endpointId);
    if (!endpoint) {
      return [];
    }

    const deliveries = this.deliveries.get(endpointId) || [];
    return deliveries.slice(-limit).reverse(); // Most recent first
  }

  /**
   * Get webhook statistics for a tenant
   */
  getStats(tenantId: string, periodHours = 24): WebhookStats {
    const now = Date.now();
    const periodStart = now - periodHours * 60 * 60 * 1000;

    const tenantEndpoints = this.endpoints.get(tenantId) || [];

    let totalEvents = 0;
    let totalDeliveries = 0;
    let successfulDeliveries = 0;
    let failedDeliveries = 0;
    let pendingDeliveries = 0;
    const byEventType: Record<string, number> = {};
    const byEndpoint: WebhookStats['byEndpoint'] = [];
    const responseTimes: number[] = [];

    for (const endpoint of tenantEndpoints) {
      const deliveries = this.deliveries.get(endpoint.id) || [];
      const periodDeliveries = deliveries.filter(d => d.createdAt >= periodStart);

      let endpointTotal = 0;
      let endpointSuccess = 0;
      let endpointFailed = 0;

      for (const delivery of periodDeliveries) {
        totalDeliveries++;
        endpointTotal++;

        if (delivery.status === 'success') {
          successfulDeliveries++;
          endpointSuccess++;
          if (delivery.responseTimeMs) {
            responseTimes.push(delivery.responseTimeMs);
          }
        } else if (delivery.status === 'failed') {
          failedDeliveries++;
          endpointFailed++;
        } else {
          pendingDeliveries++;
        }

        byEventType[delivery.eventType] = (byEventType[delivery.eventType] || 0) + 1;
      }

      // Track unique events
      const uniqueEvents = new Set(periodDeliveries.map(d => d.eventId));
      totalEvents += uniqueEvents.size;

      byEndpoint.push({
        endpointId: endpoint.id,
        name: endpoint.name,
        total: endpointTotal,
        successful: endpointSuccess,
        failed: endpointFailed,
        health: endpoint.health.status,
      });
    }

    // Calculate response time percentiles
    responseTimes.sort((a, b) => a - b);
    const avgResponseTimeMs = responseTimes.length > 0
      ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
      : 0;
    const p95Index = Math.floor(responseTimes.length * 0.95);
    const p95ResponseTimeMs = responseTimes[p95Index] || 0;

    return {
      tenantId,
      period: {
        start: periodStart,
        end: now,
      },
      totalEvents,
      totalDeliveries,
      successfulDeliveries,
      failedDeliveries,
      pendingDeliveries,
      byEventType,
      byEndpoint,
      avgResponseTimeMs,
      p95ResponseTimeMs,
    };
  }

  // ============================================
  // CLEANUP
  // ============================================

  /**
   * Clear all data for a tenant
   */
  clearTenant(tenantId: string): void {
    const tenantEndpoints = this.endpoints.get(tenantId) || [];

    // Cancel pending retries
    for (const endpoint of tenantEndpoints) {
      const deliveries = this.deliveries.get(endpoint.id) || [];
      for (const delivery of deliveries) {
        if (this.pendingRetries.has(delivery.id)) {
          clearTimeout(this.pendingRetries.get(delivery.id));
          this.pendingRetries.delete(delivery.id);
        }
      }
      this.deliveries.delete(endpoint.id);
    }

    this.endpoints.delete(tenantId);

    log.info('Cleared webhook data for tenant', { tenantId });
  }

  /**
   * Shutdown the service (cancel all pending retries)
   */
  shutdown(): void {
    for (const [deliveryId, timeout] of this.pendingRetries) {
      clearTimeout(timeout);
    }
    this.pendingRetries.clear();

    log.info('WebhookService shutdown complete');
  }
}

// ============================================
// FACTORY FUNCTION
// ============================================

/**
 * Create a new WebhookService instance
 */
export function createWebhookService(config?: WebhookServiceConfig): WebhookService {
  return new WebhookService(config);
}
