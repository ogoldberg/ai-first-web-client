/**
 * Webhook Management Tool Handlers (F-011)
 *
 * Handlers for the webhook_management MCP tool that allows users to configure
 * webhook endpoints for external integrations.
 */

import type { SmartBrowser } from '../../core/smart-browser.js';
import type {
  WebhookEventType,
  WebhookEventCategory,
  WebhookEndpointInput,
  WebhookEndpointUpdate,
} from '../../types/webhook.js';
import { jsonResponse, errorResponse, type McpResponse } from '../response-formatters.js';
import { logger } from '../../utils/logger.js';

const log = logger.create('WebhookHandler');

/**
 * Webhook management action types
 */
export type WebhookAction =
  | 'create'    // Create a new endpoint
  | 'update'    // Update an existing endpoint
  | 'delete'    // Delete an endpoint
  | 'get'       // Get endpoint details
  | 'list'      // List all endpoints
  | 'enable'    // Enable an endpoint
  | 'disable'   // Disable an endpoint
  | 'test'      // Send a test event
  | 'history'   // Get delivery history
  | 'stats';    // Get webhook statistics

/**
 * Arguments for webhook_management tool
 */
export interface WebhookManagementArgs {
  action: WebhookAction;

  // For create/update actions
  name?: string;
  description?: string;
  url?: string;
  secret?: string;
  enabledEvents?: WebhookEventType[];
  enabledCategories?: WebhookEventCategory[];
  domainFilter?: string[];
  minSeverity?: 'low' | 'medium' | 'high' | 'critical';
  maxRetries?: number;
  initialRetryDelayMs?: number;
  maxRetryDelayMs?: number;
  headers?: Record<string, string>;

  // For get/update/delete/enable/disable/test/history actions
  endpointId?: string;

  // For history action
  limit?: number;

  // For stats action
  periodHours?: number;
}

/**
 * Handle webhook_management tool call
 */
export async function handleWebhookManagement(
  smartBrowser: SmartBrowser,
  action: WebhookAction,
  args: WebhookManagementArgs
): Promise<McpResponse> {
  const webhookService = smartBrowser.getWebhookService();

  if (!webhookService) {
    return errorResponse(new Error('Webhook service not available'));
  }

  // Default tenant ID for local MCP server
  const tenantId = 'local';

  switch (action) {
    case 'create':
      return handleCreate(webhookService, tenantId, args);

    case 'update':
      return handleUpdate(webhookService, tenantId, args);

    case 'delete':
      return handleDelete(webhookService, tenantId, args);

    case 'get':
      return handleGet(webhookService, tenantId, args);

    case 'list':
      return handleList(webhookService, tenantId);

    case 'enable':
      return handleSetEnabled(webhookService, tenantId, args, true);

    case 'disable':
      return handleSetEnabled(webhookService, tenantId, args, false);

    case 'test':
      return await handleTest(webhookService, tenantId, args);

    case 'history':
      return handleHistory(webhookService, tenantId, args);

    case 'stats':
      return handleStats(webhookService, tenantId, args);

    default:
      return errorResponse(
        new Error(`Unknown action: ${action}. Valid actions: create, update, delete, get, list, enable, disable, test, history, stats`)
      );
  }
}

/**
 * Handle create action
 */
function handleCreate(
  webhookService: import('../../core/webhook-service.js').WebhookService,
  tenantId: string,
  args: WebhookManagementArgs
): McpResponse {
  // Validate required fields
  if (!args.name) {
    return errorResponse(new Error('name is required for create action'));
  }
  if (!args.url) {
    return errorResponse(new Error('url is required for create action'));
  }
  if (!args.secret) {
    return errorResponse(new Error('secret is required for create action (minimum 32 characters)'));
  }
  if (!args.enabledEvents || args.enabledEvents.length === 0) {
    return errorResponse(new Error('enabledEvents is required for create action (at least one event type)'));
  }

  try {
    const input: WebhookEndpointInput = {
      name: args.name,
      description: args.description,
      url: args.url,
      secret: args.secret,
      enabledEvents: args.enabledEvents,
      enabledCategories: args.enabledCategories,
      domainFilter: args.domainFilter,
      minSeverity: args.minSeverity,
      enabled: true,
      maxRetries: args.maxRetries ?? 3,
      initialRetryDelayMs: args.initialRetryDelayMs ?? 1000,
      maxRetryDelayMs: args.maxRetryDelayMs ?? 60000,
      headers: args.headers,
    };

    const endpoint = webhookService.createEndpoint(tenantId, input);

    log.info('Webhook endpoint created via MCP', {
      endpointId: endpoint.id,
      name: endpoint.name,
      url: endpoint.url,
    });

    return jsonResponse({
      success: true,
      message: 'Webhook endpoint created successfully',
      endpoint: {
        id: endpoint.id,
        name: endpoint.name,
        description: endpoint.description,
        url: endpoint.url,
        enabledEvents: endpoint.enabledEvents,
        enabledCategories: endpoint.enabledCategories,
        domainFilter: endpoint.domainFilter,
        minSeverity: endpoint.minSeverity,
        enabled: endpoint.enabled,
        health: endpoint.health,
        createdAt: new Date(endpoint.createdAt).toISOString(),
      },
    });
  } catch (error) {
    return errorResponse(error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * Handle update action
 */
function handleUpdate(
  webhookService: import('../../core/webhook-service.js').WebhookService,
  tenantId: string,
  args: WebhookManagementArgs
): McpResponse {
  if (!args.endpointId) {
    return errorResponse(new Error('endpointId is required for update action'));
  }

  try {
    const update: WebhookEndpointUpdate = {};

    if (args.name !== undefined) update.name = args.name;
    if (args.description !== undefined) update.description = args.description;
    if (args.url !== undefined) update.url = args.url;
    if (args.secret !== undefined) update.secret = args.secret;
    if (args.enabledEvents !== undefined) update.enabledEvents = args.enabledEvents;
    if (args.enabledCategories !== undefined) update.enabledCategories = args.enabledCategories;
    if (args.domainFilter !== undefined) update.domainFilter = args.domainFilter;
    if (args.minSeverity !== undefined) update.minSeverity = args.minSeverity;
    if (args.maxRetries !== undefined) update.maxRetries = args.maxRetries;
    if (args.initialRetryDelayMs !== undefined) update.initialRetryDelayMs = args.initialRetryDelayMs;
    if (args.maxRetryDelayMs !== undefined) update.maxRetryDelayMs = args.maxRetryDelayMs;
    if (args.headers !== undefined) update.headers = args.headers;

    const endpoint = webhookService.updateEndpoint(tenantId, args.endpointId, update);

    log.info('Webhook endpoint updated via MCP', {
      endpointId: endpoint.id,
      changes: Object.keys(update),
    });

    return jsonResponse({
      success: true,
      message: 'Webhook endpoint updated successfully',
      endpoint: {
        id: endpoint.id,
        name: endpoint.name,
        description: endpoint.description,
        url: endpoint.url,
        enabledEvents: endpoint.enabledEvents,
        enabledCategories: endpoint.enabledCategories,
        domainFilter: endpoint.domainFilter,
        minSeverity: endpoint.minSeverity,
        enabled: endpoint.enabled,
        health: endpoint.health,
        updatedAt: new Date(endpoint.updatedAt).toISOString(),
      },
    });
  } catch (error) {
    return errorResponse(error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * Handle delete action
 */
function handleDelete(
  webhookService: import('../../core/webhook-service.js').WebhookService,
  tenantId: string,
  args: WebhookManagementArgs
): McpResponse {
  if (!args.endpointId) {
    return errorResponse(new Error('endpointId is required for delete action'));
  }

  const deleted = webhookService.deleteEndpoint(tenantId, args.endpointId);

  if (!deleted) {
    return jsonResponse({
      success: false,
      message: `Endpoint ${args.endpointId} not found`,
    });
  }

  log.info('Webhook endpoint deleted via MCP', { endpointId: args.endpointId });

  return jsonResponse({
    success: true,
    message: 'Webhook endpoint deleted successfully',
    endpointId: args.endpointId,
  });
}

/**
 * Handle get action
 */
function handleGet(
  webhookService: import('../../core/webhook-service.js').WebhookService,
  tenantId: string,
  args: WebhookManagementArgs
): McpResponse {
  if (!args.endpointId) {
    return errorResponse(new Error('endpointId is required for get action'));
  }

  const endpoint = webhookService.getEndpoint(tenantId, args.endpointId);

  if (!endpoint) {
    return jsonResponse({
      success: false,
      message: `Endpoint ${args.endpointId} not found`,
    });
  }

  return jsonResponse({
    success: true,
    endpoint: {
      id: endpoint.id,
      name: endpoint.name,
      description: endpoint.description,
      url: endpoint.url,
      enabledEvents: endpoint.enabledEvents,
      enabledCategories: endpoint.enabledCategories,
      domainFilter: endpoint.domainFilter,
      minSeverity: endpoint.minSeverity,
      enabled: endpoint.enabled,
      maxRetries: endpoint.maxRetries,
      initialRetryDelayMs: endpoint.initialRetryDelayMs,
      maxRetryDelayMs: endpoint.maxRetryDelayMs,
      health: endpoint.health,
      createdAt: new Date(endpoint.createdAt).toISOString(),
      updatedAt: new Date(endpoint.updatedAt).toISOString(),
    },
  });
}

/**
 * Handle list action
 */
function handleList(
  webhookService: import('../../core/webhook-service.js').WebhookService,
  tenantId: string
): McpResponse {
  const endpoints = webhookService.listEndpoints(tenantId);

  return jsonResponse({
    success: true,
    count: endpoints.length,
    endpoints: endpoints.map(endpoint => ({
      id: endpoint.id,
      name: endpoint.name,
      url: endpoint.url,
      enabled: endpoint.enabled,
      enabledEvents: endpoint.enabledEvents.length,
      health: endpoint.health.status,
      lastDeliveryAt: endpoint.health.lastDeliveryAt
        ? new Date(endpoint.health.lastDeliveryAt).toISOString()
        : null,
    })),
  });
}

/**
 * Handle enable/disable action
 */
function handleSetEnabled(
  webhookService: import('../../core/webhook-service.js').WebhookService,
  tenantId: string,
  args: WebhookManagementArgs,
  enabled: boolean
): McpResponse {
  if (!args.endpointId) {
    return errorResponse(new Error(`endpointId is required for ${enabled ? 'enable' : 'disable'} action`));
  }

  const success = webhookService.setEndpointEnabled(tenantId, args.endpointId, enabled);

  if (!success) {
    return jsonResponse({
      success: false,
      message: `Endpoint ${args.endpointId} not found`,
    });
  }

  log.info('Webhook endpoint status changed via MCP', {
    endpointId: args.endpointId,
    enabled,
  });

  return jsonResponse({
    success: true,
    message: `Webhook endpoint ${enabled ? 'enabled' : 'disabled'} successfully`,
    endpointId: args.endpointId,
    enabled,
  });
}

/**
 * Handle test action
 */
async function handleTest(
  webhookService: import('../../core/webhook-service.js').WebhookService,
  tenantId: string,
  args: WebhookManagementArgs
): Promise<McpResponse> {
  if (!args.endpointId) {
    return errorResponse(new Error('endpointId is required for test action'));
  }

  log.info('Testing webhook endpoint via MCP', { endpointId: args.endpointId });

  const result = await webhookService.testEndpoint(tenantId, args.endpointId);

  return jsonResponse({
    success: result.success,
    message: result.success
      ? 'Test webhook delivered successfully'
      : `Test failed: ${result.error}`,
    testResult: {
      endpointId: result.endpointId,
      responseStatus: result.responseStatus,
      responseTimeMs: result.responseTimeMs,
      error: result.error,
      signatureVerified: result.signatureVerified,
    },
  });
}

/**
 * Handle history action
 */
function handleHistory(
  webhookService: import('../../core/webhook-service.js').WebhookService,
  tenantId: string,
  args: WebhookManagementArgs
): McpResponse {
  if (!args.endpointId) {
    return errorResponse(new Error('endpointId is required for history action'));
  }

  const limit = args.limit ?? 20;
  const deliveries = webhookService.getDeliveryHistory(tenantId, args.endpointId, limit);

  return jsonResponse({
    success: true,
    endpointId: args.endpointId,
    count: deliveries.length,
    deliveries: deliveries.map(d => ({
      id: d.id,
      eventType: d.eventType,
      status: d.status,
      attempts: d.attempts,
      responseStatus: d.responseStatus,
      responseTimeMs: d.responseTimeMs,
      errorMessage: d.errorMessage,
      createdAt: new Date(d.createdAt).toISOString(),
      completedAt: d.completedAt ? new Date(d.completedAt).toISOString() : null,
    })),
  });
}

/**
 * Handle stats action
 */
function handleStats(
  webhookService: import('../../core/webhook-service.js').WebhookService,
  tenantId: string,
  args: WebhookManagementArgs
): McpResponse {
  const periodHours = args.periodHours ?? 24;
  const stats = webhookService.getStats(tenantId, periodHours);

  return jsonResponse({
    success: true,
    stats: {
      period: {
        hours: periodHours,
        start: new Date(stats.period.start).toISOString(),
        end: new Date(stats.period.end).toISOString(),
      },
      summary: {
        totalEvents: stats.totalEvents,
        totalDeliveries: stats.totalDeliveries,
        successfulDeliveries: stats.successfulDeliveries,
        failedDeliveries: stats.failedDeliveries,
        pendingDeliveries: stats.pendingDeliveries,
        successRate: stats.totalDeliveries > 0
          ? `${Math.round((stats.successfulDeliveries / stats.totalDeliveries) * 100)}%`
          : 'N/A',
      },
      performance: {
        avgResponseTimeMs: Math.round(stats.avgResponseTimeMs),
        p95ResponseTimeMs: Math.round(stats.p95ResponseTimeMs),
      },
      byEventType: stats.byEventType,
      byEndpoint: stats.byEndpoint,
    },
  });
}
