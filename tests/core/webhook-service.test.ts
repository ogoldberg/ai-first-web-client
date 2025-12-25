/**
 * WebhookService Tests (F-011)
 *
 * Tests for the general-purpose webhook notification system.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createHmac } from 'crypto';
import { WebhookService, createWebhookService } from '../../src/core/webhook-service.js';
import {
  getEventCategory,
  meetsSeverityThreshold,
  type WebhookEndpointInput,
  type WebhookEventType,
  type BrowseEventData,
} from '../../src/types/webhook.js';

// Mock fetch for webhook delivery testing
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('WebhookService', () => {
  let service: WebhookService;
  const tenantId = 'test-tenant';

  beforeEach(() => {
    service = createWebhookService();
    mockFetch.mockReset();
  });

  afterEach(() => {
    service.shutdown();
  });

  describe('Endpoint Management', () => {
    const validInput: WebhookEndpointInput = {
      name: 'Test Webhook',
      description: 'Test endpoint for notifications',
      url: 'https://example.com/webhook',
      secret: 'test-secret-at-least-32-characters-long',
      enabledEvents: ['browse.completed', 'browse.failed'],
      enabled: true,
      maxRetries: 3,
      initialRetryDelayMs: 1000,
      maxRetryDelayMs: 60000,
    };

    it('should create a webhook endpoint', () => {
      const endpoint = service.createEndpoint(tenantId, validInput);

      expect(endpoint).toBeDefined();
      expect(endpoint.id).toBeDefined();
      expect(endpoint.name).toBe('Test Webhook');
      expect(endpoint.url).toBe('https://example.com/webhook');
      expect(endpoint.secret).toBe(validInput.secret);
      expect(endpoint.enabledEvents).toEqual(['browse.completed', 'browse.failed']);
      expect(endpoint.enabled).toBe(true);
      expect(endpoint.health.status).toBe('healthy');
    });

    it('should update a webhook endpoint', () => {
      const endpoint = service.createEndpoint(tenantId, validInput);

      const updated = service.updateEndpoint(tenantId, endpoint.id, {
        name: 'Updated Webhook',
        enabledEvents: ['pattern.discovered'],
      });

      expect(updated.name).toBe('Updated Webhook');
      expect(updated.enabledEvents).toEqual(['pattern.discovered']);
      expect(updated.url).toBe(validInput.url); // Unchanged
      expect(updated.secret).toBe(validInput.secret); // Unchanged
    });

    it('should keep existing secret when not provided on update', () => {
      const endpoint = service.createEndpoint(tenantId, validInput);
      const originalSecret = endpoint.secret;

      const updated = service.updateEndpoint(tenantId, endpoint.id, {
        name: 'Updated Name',
      });

      expect(updated.secret).toBe(originalSecret);
    });

    it('should delete a webhook endpoint', () => {
      const endpoint = service.createEndpoint(tenantId, validInput);

      const deleted = service.deleteEndpoint(tenantId, endpoint.id);
      expect(deleted).toBe(true);

      const found = service.getEndpoint(tenantId, endpoint.id);
      expect(found).toBeUndefined();
    });

    it('should return false when deleting non-existent endpoint', () => {
      const deleted = service.deleteEndpoint(tenantId, 'non-existent-id');
      expect(deleted).toBe(false);
    });

    it('should list all endpoints for a tenant', () => {
      service.createEndpoint(tenantId, validInput);
      service.createEndpoint(tenantId, {
        ...validInput,
        name: 'Second Webhook',
        url: 'https://example.com/webhook2',
      });

      const endpoints = service.listEndpoints(tenantId);
      expect(endpoints).toHaveLength(2);
      expect(endpoints.map(e => e.name)).toContain('Test Webhook');
      expect(endpoints.map(e => e.name)).toContain('Second Webhook');
    });

    it('should enable and disable an endpoint', () => {
      const endpoint = service.createEndpoint(tenantId, validInput);

      service.setEndpointEnabled(tenantId, endpoint.id, false);
      let found = service.getEndpoint(tenantId, endpoint.id);
      expect(found?.enabled).toBe(false);

      service.setEndpointEnabled(tenantId, endpoint.id, true);
      found = service.getEndpoint(tenantId, endpoint.id);
      expect(found?.enabled).toBe(true);
    });

    it('should enforce maximum endpoints per tenant', () => {
      const limitedService = createWebhookService({ maxEndpointsPerTenant: 2 });

      limitedService.createEndpoint(tenantId, validInput);
      limitedService.createEndpoint(tenantId, {
        ...validInput,
        name: 'Second',
        url: 'https://example.com/webhook2',
      });

      expect(() => {
        limitedService.createEndpoint(tenantId, {
          ...validInput,
          name: 'Third',
          url: 'https://example.com/webhook3',
        });
      }).toThrow('Maximum endpoints (2) reached for tenant');

      limitedService.shutdown();
    });

    it('should reject duplicate URLs', () => {
      service.createEndpoint(tenantId, validInput);

      expect(() => {
        service.createEndpoint(tenantId, {
          ...validInput,
          name: 'Duplicate URL',
        });
      }).toThrow('Endpoint with URL https://example.com/webhook already exists');
    });
  });

  describe('Input Validation', () => {
    it('should reject invalid URL', () => {
      expect(() => {
        service.createEndpoint(tenantId, {
          name: 'Test',
          url: 'not-a-url',
          secret: 'test-secret-at-least-32-characters-long',
          enabledEvents: ['browse.completed'],
        });
      }).toThrow();
    });

    it('should reject short secret', () => {
      expect(() => {
        service.createEndpoint(tenantId, {
          name: 'Test',
          url: 'https://example.com/webhook',
          secret: 'short',
          enabledEvents: ['browse.completed'],
        });
      }).toThrow();
    });

    it('should reject empty enabledEvents', () => {
      expect(() => {
        service.createEndpoint(tenantId, {
          name: 'Test',
          url: 'https://example.com/webhook',
          secret: 'test-secret-at-least-32-characters-long',
          enabledEvents: [],
        });
      }).toThrow();
    });
  });

  describe('Event Dispatch', () => {
    const validInput: WebhookEndpointInput = {
      name: 'Test Webhook',
      url: 'https://example.com/webhook',
      secret: 'test-secret-at-least-32-characters-long',
      enabledEvents: ['browse.completed', 'browse.failed'],
      enabled: true,
      maxRetries: 0, // No retries for faster tests
      initialRetryDelayMs: 1000,
      maxRetryDelayMs: 60000,
    };

    it('should dispatch event to matching endpoint', async () => {
      service.createEndpoint(tenantId, validInput);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
      });

      const eventData: BrowseEventData = {
        url: 'https://example.com/page',
        finalUrl: 'https://example.com/page',
        domain: 'example.com',
        success: true,
        durationMs: 500,
        tier: 'intelligence',
      };

      const results = await service.dispatchEvent(
        tenantId,
        'browse.completed',
        eventData,
        { domain: 'example.com' }
      );

      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Verify headers
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('https://example.com/webhook');
      expect(options.method).toBe('POST');
      expect(options.headers['Content-Type']).toBe('application/json');
      expect(options.headers['X-Webhook-Event']).toBe('browse.completed');
      expect(options.headers['X-Webhook-Signature']).toMatch(/^sha256=/);
    });

    it('should not dispatch to disabled endpoint', async () => {
      const endpoint = service.createEndpoint(tenantId, validInput);
      service.setEndpointEnabled(tenantId, endpoint.id, false);

      const results = await service.dispatchEvent(
        tenantId,
        'browse.completed',
        { url: 'https://example.com' } as BrowseEventData,
        {}
      );

      expect(results).toHaveLength(0);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should not dispatch to endpoint with non-matching event type', async () => {
      service.createEndpoint(tenantId, validInput);

      const results = await service.dispatchEvent(
        tenantId,
        'pattern.discovered', // Not in enabledEvents
        { patternId: 'test' },
        {}
      );

      expect(results).toHaveLength(0);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should dispatch to multiple matching endpoints', async () => {
      service.createEndpoint(tenantId, validInput);
      service.createEndpoint(tenantId, {
        ...validInput,
        name: 'Second Webhook',
        url: 'https://example.com/webhook2',
      });

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
      });

      const results = await service.dispatchEvent(
        tenantId,
        'browse.completed',
        { url: 'https://example.com' } as BrowseEventData,
        {}
      );

      expect(results).toHaveLength(2);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should handle delivery failure', async () => {
      service.createEndpoint(tenantId, validInput);

      mockFetch.mockRejectedValueOnce(new Error('Connection refused'));

      const results = await service.dispatchEvent(
        tenantId,
        'browse.completed',
        { url: 'https://example.com' } as BrowseEventData,
        {}
      );

      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(false);
      expect(results[0].error).toBe('Connection refused');
    });

    it('should handle HTTP error response', async () => {
      service.createEndpoint(tenantId, validInput);

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      const results = await service.dispatchEvent(
        tenantId,
        'browse.completed',
        { url: 'https://example.com' } as BrowseEventData,
        {}
      );

      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(false);
      expect(results[0].error).toContain('HTTP 500');
    });
  });

  describe('Event Filtering', () => {
    it('should filter by domain', async () => {
      service.createEndpoint(tenantId, {
        name: 'Domain Filtered',
        url: 'https://example.com/webhook',
        secret: 'test-secret-at-least-32-characters-long',
        enabledEvents: ['browse.completed'],
        domainFilter: ['allowed-domain.com'],
        enabled: true,
        maxRetries: 0,
        initialRetryDelayMs: 1000,
        maxRetryDelayMs: 60000,
      });

      mockFetch.mockResolvedValue({ ok: true, status: 200 });

      // Event for non-allowed domain should not be delivered
      let results = await service.dispatchEvent(
        tenantId,
        'browse.completed',
        { url: 'https://other-domain.com' } as BrowseEventData,
        { domain: 'other-domain.com' }
      );
      expect(results).toHaveLength(0);

      // Event for allowed domain should be delivered
      results = await service.dispatchEvent(
        tenantId,
        'browse.completed',
        { url: 'https://allowed-domain.com' } as BrowseEventData,
        { domain: 'allowed-domain.com' }
      );
      expect(results).toHaveLength(1);
    });

    it('should filter by severity', async () => {
      service.createEndpoint(tenantId, {
        name: 'High Severity Only',
        url: 'https://example.com/webhook',
        secret: 'test-secret-at-least-32-characters-long',
        enabledEvents: ['error.rate_limit'],
        minSeverity: 'high',
        enabled: true,
        maxRetries: 0,
        initialRetryDelayMs: 1000,
        maxRetryDelayMs: 60000,
      });

      mockFetch.mockResolvedValue({ ok: true, status: 200 });

      // Low severity event should not be delivered
      let results = await service.dispatchEvent(
        tenantId,
        'error.rate_limit',
        { message: 'Rate limited' },
        { severity: 'low' }
      );
      expect(results).toHaveLength(0);

      // High severity event should be delivered
      results = await service.dispatchEvent(
        tenantId,
        'error.rate_limit',
        { message: 'Rate limited' },
        { severity: 'high' }
      );
      expect(results).toHaveLength(1);

      // Critical severity (higher than high) should be delivered
      results = await service.dispatchEvent(
        tenantId,
        'error.rate_limit',
        { message: 'Rate limited' },
        { severity: 'critical' }
      );
      expect(results).toHaveLength(1);
    });
  });

  describe('Health Tracking', () => {
    it('should update health on successful delivery', async () => {
      const endpoint = service.createEndpoint(tenantId, {
        name: 'Test',
        url: 'https://example.com/webhook',
        secret: 'test-secret-at-least-32-characters-long',
        enabledEvents: ['browse.completed'],
        enabled: true,
        maxRetries: 0,
        initialRetryDelayMs: 1000,
        maxRetryDelayMs: 60000,
      });

      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

      await service.dispatchEvent(
        tenantId,
        'browse.completed',
        { url: 'https://example.com' } as BrowseEventData,
        {}
      );

      const updated = service.getEndpoint(tenantId, endpoint.id);
      expect(updated?.health.totalDeliveries).toBe(1);
      expect(updated?.health.successfulDeliveries).toBe(1);
      expect(updated?.health.failedDeliveries).toBe(0);
      expect(updated?.health.consecutiveFailures).toBe(0);
      expect(updated?.health.status).toBe('healthy');
    });

    it('should update health on failed delivery', async () => {
      const endpoint = service.createEndpoint(tenantId, {
        name: 'Test',
        url: 'https://example.com/webhook',
        secret: 'test-secret-at-least-32-characters-long',
        enabledEvents: ['browse.completed'],
        enabled: true,
        maxRetries: 0,
        initialRetryDelayMs: 1000,
        maxRetryDelayMs: 60000,
      });

      mockFetch.mockRejectedValueOnce(new Error('Connection failed'));

      await service.dispatchEvent(
        tenantId,
        'browse.completed',
        { url: 'https://example.com' } as BrowseEventData,
        {}
      );

      const updated = service.getEndpoint(tenantId, endpoint.id);
      expect(updated?.health.totalDeliveries).toBe(1);
      expect(updated?.health.successfulDeliveries).toBe(0);
      expect(updated?.health.failedDeliveries).toBe(1);
      expect(updated?.health.consecutiveFailures).toBe(1);
    });

    it('should mark endpoint unhealthy after circuit breaker threshold', async () => {
      const testService = createWebhookService({ circuitBreakerThreshold: 3 });
      const endpoint = testService.createEndpoint(tenantId, {
        name: 'Test',
        url: 'https://example.com/webhook',
        secret: 'test-secret-at-least-32-characters-long',
        enabledEvents: ['browse.completed'],
        enabled: true,
        maxRetries: 0,
        initialRetryDelayMs: 1000,
        maxRetryDelayMs: 60000,
      });

      mockFetch.mockRejectedValue(new Error('Connection failed'));

      // Trigger 3 failures
      for (let i = 0; i < 3; i++) {
        await testService.dispatchEvent(
          tenantId,
          'browse.completed',
          { url: 'https://example.com' } as BrowseEventData,
          {}
        );
      }

      const updated = testService.getEndpoint(tenantId, endpoint.id);
      expect(updated?.health.status).toBe('unhealthy');

      // Unhealthy endpoint should not receive events
      mockFetch.mockClear();
      const results = await testService.dispatchEvent(
        tenantId,
        'browse.completed',
        { url: 'https://example.com' } as BrowseEventData,
        {}
      );
      expect(results).toHaveLength(0);
      expect(mockFetch).not.toHaveBeenCalled();

      testService.shutdown();
    });
  });

  describe('Signature Verification', () => {
    it('should verify valid signature', () => {
      const payload = JSON.stringify({ test: 'data' });
      const secret = 'test-secret-at-least-32-characters-long';

      // Generate signature the same way the service does
      const signature = createHmac('sha256', secret)
        .update(payload)
        .digest('hex');

      const isValid = service.verifySignature(payload, signature, secret);
      expect(isValid).toBe(true);
    });

    it('should reject invalid signature', () => {
      const payload = JSON.stringify({ test: 'data' });
      const secret = 'test-secret-at-least-32-characters-long';

      const isValid = service.verifySignature(payload, 'invalid-signature', secret);
      expect(isValid).toBe(false);
    });

    it('should reject signature with wrong length', () => {
      const payload = JSON.stringify({ test: 'data' });
      const secret = 'test-secret-at-least-32-characters-long';

      const isValid = service.verifySignature(payload, 'short', secret);
      expect(isValid).toBe(false);
    });
  });

  describe('Testing Endpoints', () => {
    it('should send test event to endpoint', async () => {
      const endpoint = service.createEndpoint(tenantId, {
        name: 'Test',
        url: 'https://example.com/webhook',
        secret: 'test-secret-at-least-32-characters-long',
        enabledEvents: ['browse.completed'],
        enabled: true,
        maxRetries: 0,
        initialRetryDelayMs: 1000,
        maxRetryDelayMs: 60000,
      });

      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

      const result = await service.testEndpoint(tenantId, endpoint.id);

      expect(result.success).toBe(true);
      expect(result.signatureVerified).toBe(true);

      // Verify test header was sent
      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers['X-Webhook-Test']).toBe('true');
    });

    it('should return error for non-existent endpoint', async () => {
      const result = await service.testEndpoint(tenantId, 'non-existent');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Endpoint not found');
    });
  });

  describe('Statistics', () => {
    it('should return webhook statistics', async () => {
      const endpoint = service.createEndpoint(tenantId, {
        name: 'Test',
        url: 'https://example.com/webhook',
        secret: 'test-secret-at-least-32-characters-long',
        enabledEvents: ['browse.completed', 'browse.failed'],
        enabled: true,
        maxRetries: 0,
        initialRetryDelayMs: 1000,
        maxRetryDelayMs: 60000,
      });

      // Successful delivery
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });
      await service.dispatchEvent(tenantId, 'browse.completed', {} as BrowseEventData, {});

      // Failed delivery
      mockFetch.mockRejectedValueOnce(new Error('Failed'));
      await service.dispatchEvent(tenantId, 'browse.failed', {} as BrowseEventData, {});

      const stats = service.getStats(tenantId);

      expect(stats.totalDeliveries).toBe(2);
      expect(stats.successfulDeliveries).toBe(1);
      expect(stats.failedDeliveries).toBe(1);
      expect(stats.byEventType['browse.completed']).toBe(1);
      expect(stats.byEventType['browse.failed']).toBe(1);
      expect(stats.byEndpoint).toHaveLength(1);
      expect(stats.byEndpoint[0].endpointId).toBe(endpoint.id);
    });

    it('should return delivery history for endpoint', async () => {
      const endpoint = service.createEndpoint(tenantId, {
        name: 'Test',
        url: 'https://example.com/webhook',
        secret: 'test-secret-at-least-32-characters-long',
        enabledEvents: ['browse.completed'],
        enabled: true,
        maxRetries: 0,
        initialRetryDelayMs: 1000,
        maxRetryDelayMs: 60000,
      });

      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });
      await service.dispatchEvent(tenantId, 'browse.completed', {} as BrowseEventData, {});

      const history = service.getDeliveryHistory(tenantId, endpoint.id);

      expect(history).toHaveLength(1);
      expect(history[0].eventType).toBe('browse.completed');
      expect(history[0].status).toBe('success');
    });
  });

  describe('Cleanup', () => {
    it('should clear all data for tenant', () => {
      service.createEndpoint(tenantId, {
        name: 'Test',
        url: 'https://example.com/webhook',
        secret: 'test-secret-at-least-32-characters-long',
        enabledEvents: ['browse.completed'],
        enabled: true,
        maxRetries: 0,
        initialRetryDelayMs: 1000,
        maxRetryDelayMs: 60000,
      });

      service.clearTenant(tenantId);

      const endpoints = service.listEndpoints(tenantId);
      expect(endpoints).toHaveLength(0);
    });
  });
});

describe('Webhook Types', () => {
  describe('getEventCategory', () => {
    it('should extract category from event type', () => {
      expect(getEventCategory('browse.completed')).toBe('browse');
      expect(getEventCategory('content_change.detected')).toBe('content_change');
      expect(getEventCategory('pattern.discovered')).toBe('pattern');
      expect(getEventCategory('error.rate_limit')).toBe('error');
      expect(getEventCategory('feedback.submitted')).toBe('feedback');
      expect(getEventCategory('system.health')).toBe('system');
    });
  });

  describe('meetsSeverityThreshold', () => {
    it('should return true when no minimum severity', () => {
      expect(meetsSeverityThreshold('low', undefined)).toBe(true);
    });

    it('should return true when event has no severity', () => {
      expect(meetsSeverityThreshold(undefined, 'high')).toBe(true);
    });

    it('should compare severity levels correctly', () => {
      expect(meetsSeverityThreshold('low', 'low')).toBe(true);
      expect(meetsSeverityThreshold('low', 'medium')).toBe(false);
      expect(meetsSeverityThreshold('medium', 'medium')).toBe(true);
      expect(meetsSeverityThreshold('high', 'medium')).toBe(true);
      expect(meetsSeverityThreshold('critical', 'high')).toBe(true);
    });
  });
});
