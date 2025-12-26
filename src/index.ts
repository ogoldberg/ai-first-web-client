#!/usr/bin/env node

/**
 * LLM Browser MCP Server
 *
 * An intelligent browser designed for LLM interactions with:
 * - Automatic API discovery and learning
 * - Content structure learning with selector fallbacks
 * - Cross-domain pattern transfer
 * - Response validation
 * - Pagination detection
 * - Change frequency tracking
 * - Session management
 *
 * The browser gets smarter over time, learning from every interaction.
 *
 * Architecture: This file uses the MCP modules from ./mcp/ which provide:
 * - sdk-client.ts: SDK client wrapper for MCP handlers
 * - tool-schemas.ts: Tool schema definitions
 * - response-formatters.ts: Response formatting utilities
 * - handlers/: Tool handler implementations
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

// MCP modules - SDK-009: Refactored MCP architecture
import {
  getMcpSdkClient,
  jsonResponse,
  errorResponse,
  getFilteredToolSchemas,
  DEBUG_TOOLS,
  ADMIN_TOOLS,
  // Tool handlers
  handleSmartBrowse,
  handleBatchBrowse,
  handleCaptureScreenshot,
  handleExportHar,
  handleDebugTraces,
  handleSessionManagement,
  handleExecuteApiCall,
  handleAiFeedback,
  handleWebhookManagement,
  type SmartBrowseArgs,
  type BatchBrowseArgs,
  type DebugTracesAction,
  type SessionAction,
  type FeedbackAction,
  type WebhookAction,
} from './mcp/index.js';

// Auth helpers (not yet extracted to handlers)
import {
  type AuthType,
  handleAuthStatus,
  handleAuthConfigure,
  handleOAuthComplete,
  handleAuthGuidance,
  handleAuthDelete,
  handleAuthList,
} from './tools/auth-helpers.js';

import { logger } from './utils/logger.js';
import { getToolSelectionMetrics } from './utils/tool-selection-metrics.js';
import { unknownToolError } from './utils/error-messages.js';

/**
 * Helper to read boolean mode flags from environment variables
 * Accepts '1' or 'true' (case-insensitive) as truthy values
 */
const getModeFlag = (envVar: string): boolean =>
  ['1', 'true'].includes((process.env[envVar] || '').toLowerCase());

/**
 * TC-004: Debug mode flag
 * When false, debug tools (capture_screenshot, export_har, debug_traces) are hidden from tool list
 * Set LLM_BROWSER_DEBUG_MODE=1 or LLM_BROWSER_DEBUG_MODE=true to enable
 */
const DEBUG_MODE = getModeFlag('LLM_BROWSER_DEBUG_MODE');

/**
 * TC-005/TC-006/TC-007/TC-008: Admin mode flag
 * When false, admin and deprecated tools are hidden from tool list
 * Set LLM_BROWSER_ADMIN_MODE=1 or LLM_BROWSER_ADMIN_MODE=true to enable
 */
const ADMIN_MODE = getModeFlag('LLM_BROWSER_ADMIN_MODE');

// Initialize core components using SDK client (SDK-009)
const sdkClient = getMcpSdkClient();
const browserManager = sdkClient.browserManager;
const sessionManager = sdkClient.sessionManager;
const learningEngine = sdkClient.learningEngine;
const smartBrowser = sdkClient.smartBrowser;
const apiCallTool = sdkClient.apiCallTool;
const authWorkflow = sdkClient.authWorkflow;

// Create MCP server
const server = new Server(
  {
    name: 'llm-browser',
    version: '0.5.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// ============================================
// Tool List Handler
// ============================================
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: getFilteredToolSchemas(DEBUG_MODE, ADMIN_MODE),
  };
});

// ============================================
// Tool Call Handler
// ============================================
server.setRequestHandler(CallToolRequestSchema, async request => {
  const { name, arguments: args } = request.params;
  const startTime = Date.now();

  // TC-010: Initialize tool selection metrics for recording
  const toolMetrics = getToolSelectionMetrics();
  toolMetrics.initialize().catch(() => {
    // Silently ignore initialization failures - metrics are non-critical
  });

  // Helper to record tool invocation result
  const recordToolInvocation = async (success: boolean, error?: string) => {
    try {
      await toolMetrics.record({
        timestamp: startTime,
        tool: name,
        success,
        error,
        durationMs: Date.now() - startTime,
        sessionId: undefined,
        tenantId: undefined,
      });
    } catch {
      // Silently ignore recording failures - metrics are non-critical
    }
  };

  // TC-004: Block debug tools if DEBUG_MODE is disabled (safety check)
  if (!DEBUG_MODE && DEBUG_TOOLS.includes(name)) {
    await recordToolInvocation(false, 'Debug mode required');
    return errorResponse(
      `${name} is a debug tool and requires LLM_BROWSER_DEBUG_MODE=1 to be set. ` +
        'Debug tools are hidden by default to reduce cognitive load for LLMs.'
    );
  }

  // TC-005/TC-006: Block admin tools if ADMIN_MODE is disabled (safety check)
  if (!ADMIN_MODE && ADMIN_TOOLS.includes(name)) {
    await recordToolInvocation(false, 'Admin mode required');
    return errorResponse(
      `${name} is an admin tool and requires LLM_BROWSER_ADMIN_MODE=1 to be set. ` +
        'Admin tools (analytics, infrastructure) are hidden by default to reduce cognitive load for LLMs.'
    );
  }

  try {
    if (!args) {
      throw new Error('Missing arguments');
    }

    switch (name) {
      // ============================================
      // PRIMARY TOOLS
      // ============================================

      case 'smart_browse': {
        const browseArgs: SmartBrowseArgs = {
          url: args.url as string,
          contentType: args.contentType as string,
          followPagination: args.followPagination as boolean,
          maxPages: args.maxPages as number,
          checkForChanges: args.checkForChanges as boolean,
          waitForSelector: args.waitForSelector as string,
          scrollToLoad: args.scrollToLoad as boolean,
          sessionProfile: args.sessionProfile as string,
          maxChars: args.maxChars as number,
          includeTables: args.includeTables as boolean,
          includeNetwork: args.includeNetwork as boolean,
          includeConsole: args.includeConsole as boolean,
          includeHtml: args.includeHtml as boolean,
          includeInsights: args.includeInsights as boolean,
          includeDecisionTrace: args.includeDecisionTrace as boolean,
          maxLatencyMs: args.maxLatencyMs as number,
          maxCostTier: args.maxCostTier as 'intelligence' | 'lightweight' | 'playwright',
          freshnessRequirement: args.freshnessRequirement as 'realtime' | 'cached' | 'any',
        };
        const result = await handleSmartBrowse(smartBrowser, browseArgs);
        await recordToolInvocation(true);
        return result;
      }

      case 'batch_browse': {
        const batchArgs: BatchBrowseArgs = {
          urls: args.urls as string[],
          contentType: args.contentType as string,
          waitForSelector: args.waitForSelector as string,
          scrollToLoad: args.scrollToLoad as boolean,
          sessionProfile: args.sessionProfile as string,
          maxChars: args.maxChars as number,
          includeTables: args.includeTables as boolean,
          includeNetwork: args.includeNetwork as boolean,
          includeConsole: args.includeConsole as boolean,
          concurrency: args.concurrency as number,
          stopOnError: args.stopOnError as boolean,
          continueOnRateLimit: args.continueOnRateLimit as boolean,
          perUrlTimeoutMs: args.perUrlTimeoutMs as number,
          totalTimeoutMs: args.totalTimeoutMs as number,
          maxLatencyMs: args.maxLatencyMs as number,
          maxCostTier: args.maxCostTier as 'intelligence' | 'lightweight' | 'playwright',
        };
        const result = await handleBatchBrowse(smartBrowser, batchArgs);
        await recordToolInvocation(true);
        return result;
      }

      case 'execute_api_call': {
        const result = await handleExecuteApiCall(apiCallTool, {
          url: args.url as string,
          method: args.method as string,
          headers: args.headers as Record<string, string>,
          body: args.body,
          sessionProfile: args.sessionProfile as string,
        });
        await recordToolInvocation(true);
        return result;
      }

      case 'session_management': {
        const result = await handleSessionManagement(
          browserManager,
          sessionManager,
          args.action as SessionAction,
          {
            domain: args.domain as string,
            sessionProfile: args.sessionProfile as string,
          }
        );
        await recordToolInvocation(true);
        return result;
      }

      // ============================================
      // UNIFIED API AUTH (TC-001)
      // ============================================

      case 'api_auth': {
        const action = args.action as string;
        let result;

        switch (action) {
          case 'status': {
            if (!args.domain) {
              return errorResponse("Missing required parameter 'domain' for action 'status'");
            }
            result = await handleAuthStatus(
              authWorkflow,
              args.domain as string,
              (args.profile as string) || 'default'
            );
            break;
          }

          case 'configure': {
            if (!args.domain) {
              return errorResponse("Missing required parameter 'domain' for action 'configure'");
            }
            if (!args.authType) {
              return errorResponse("Missing required parameter 'authType' for action 'configure'");
            }
            if (!args.credentials) {
              return errorResponse(
                "Missing required parameter 'credentials' for action 'configure'"
              );
            }
            result = await handleAuthConfigure(
              authWorkflow,
              args.domain as string,
              args.authType as string,
              args.credentials as Record<string, unknown>,
              (args.profile as string) || 'default',
              args.validate !== false
            );
            if ('error' in result && !('success' in result)) {
              return errorResponse(result.error);
            }
            break;
          }

          case 'complete_oauth': {
            if (!args.code) {
              return errorResponse(
                "Missing required parameter 'code' for action 'complete_oauth'"
              );
            }
            if (!args.state) {
              return errorResponse(
                "Missing required parameter 'state' for action 'complete_oauth'"
              );
            }
            result = await handleOAuthComplete(authWorkflow, args.code as string, args.state as string);
            break;
          }

          case 'guidance': {
            if (!args.domain) {
              return errorResponse("Missing required parameter 'domain' for action 'guidance'");
            }
            result = await handleAuthGuidance(
              authWorkflow,
              args.domain as string,
              args.authType as string | undefined
            );
            break;
          }

          case 'delete': {
            if (!args.domain) {
              return errorResponse("Missing required parameter 'domain' for action 'delete'");
            }
            result = await handleAuthDelete(
              authWorkflow,
              args.domain as string,
              args.authType as AuthType | undefined,
              (args.profile as string) || 'default'
            );
            break;
          }

          case 'list': {
            result = handleAuthList(authWorkflow);
            break;
          }

          default:
            return errorResponse(
              `Unknown action: ${action}. Valid actions: status, configure, complete_oauth, guidance, delete, list`
            );
        }
        await recordToolInvocation(true);
        return jsonResponse(result);
      }

      // ============================================
      // DEBUG TOOLS (TC-004)
      // ============================================

      case 'capture_screenshot': {
        const result = await handleCaptureScreenshot(smartBrowser, {
          url: args.url as string,
          fullPage: args.fullPage as boolean,
          element: args.element as string,
          waitForSelector: args.waitForSelector as string,
          sessionProfile: args.sessionProfile as string,
          width: args.width as number,
          height: args.height as number,
        });
        await recordToolInvocation(true);
        return result;
      }

      case 'export_har': {
        const result = await handleExportHar(smartBrowser, {
          url: args.url as string,
          includeResponseBodies: args.includeResponseBodies as boolean,
          maxBodySize: args.maxBodySize as number,
          pageTitle: args.pageTitle as string,
          waitForSelector: args.waitForSelector as string,
          sessionProfile: args.sessionProfile as string,
        });
        await recordToolInvocation(true);
        return result;
      }

      case 'debug_traces': {
        const result = await handleDebugTraces(
          smartBrowser,
          args.action as DebugTracesAction,
          args as Record<string, unknown>
        );
        await recordToolInvocation(true);
        return result;
      }

      case 'ai_feedback': {
        // Generate a session ID for rate limiting
        const sessionId = `session-${Date.now()}`;
        const result = await handleAiFeedback(
          smartBrowser,
          args.action as FeedbackAction,
          args as unknown as Parameters<typeof handleAiFeedback>[2],
          sessionId
        );
        await recordToolInvocation(true);
        return result;
      }

      case 'webhook_management': {
        const result = await handleWebhookManagement(
          smartBrowser,
          args.action as WebhookAction,
          args as unknown as Parameters<typeof handleWebhookManagement>[2]
        );
        await recordToolInvocation(true);
        return result;
      }

      default: {
        // Get list of available tools for helpful error message
        const availableTools = [
          'smart_browse', 'batch_browse', 'execute_api_call', 'session_management', 'api_auth',
          'ai_feedback', 'webhook_management',
          ...(DEBUG_MODE ? ['capture_screenshot', 'export_har', 'debug_traces'] : []),
        ];
        throw new Error(unknownToolError(name, availableTools));
      }
    }
  } catch (error) {
    // TC-010: Record failed tool invocation
    const errorMessage = error instanceof Error ? error.message : String(error);
    await recordToolInvocation(false, errorMessage);

    // Extract URL and domain from request args for error context
    const url = typeof args?.url === 'string' ? args.url : undefined;
    let domain: string | undefined;
    if (url) {
      try {
        domain = new URL(url).hostname;
      } catch {
        // Invalid URL, leave domain undefined
      }
    }

    // Use structured error response with context
    return errorResponse(error instanceof Error ? error : new Error(String(error)), undefined, {
      url,
      domain,
    });
  }
});

// ============================================
// Server Initialization
// ============================================
async function main() {
  await sessionManager.initialize();
  await learningEngine.initialize();
  await smartBrowser.initialize();
  await authWorkflow.initialize();

  const transport = new StdioServerTransport();
  await server.connect(transport);

  logger.server.info('LLM Browser MCP Server started', {
    version: '0.5.0',
    primaryTool: 'smart_browse',
    features: [
      'Tiered rendering',
      'Semantic embeddings',
      'Cross-domain learning',
      'API discovery',
      'Procedural memory',
    ],
    tiers: { intelligence: '~50ms', lightweight: '~200-500ms', playwright: '~2-5s' },
  });

  // Cleanup on exit
  process.on('SIGINT', async () => {
    logger.server.info('Shutting down');
    await browserManager.cleanup();
    process.exit(0);
  });
}

main().catch(error => {
  logger.server.error('Fatal error', { error });
  process.exit(1);
});
