/**
 * Session Tool Handlers
 *
 * Handlers for session management and API-related tools:
 * - session_management
 * - execute_api_call
 * - get_browser_providers
 */

import { BrowserManager } from '../../core/browser-manager.js';
import type { SessionManager } from '../../core/session-manager.js';
import type { ApiCallTool } from '../../tools/api-call-tool.js';
import { jsonResponse, errorResponse, type McpResponse } from '../response-formatters.js';

/**
 * Session management action types
 */
export type SessionAction = 'save' | 'list' | 'health';

/**
 * Handle session_management tool call
 */
export async function handleSessionManagement(
  browserManager: BrowserManager,
  sessionManager: SessionManager,
  action: SessionAction,
  args: {
    domain?: string;
    sessionProfile?: string;
  }
): Promise<McpResponse> {
  switch (action) {
    case 'save': {
      if (!args.domain) {
        return errorResponse('domain is required for save action');
      }
      const context = await browserManager.getContext(args.sessionProfile || 'default');
      await sessionManager.saveSession(args.domain, context, args.sessionProfile || 'default');
      return jsonResponse({ success: true, message: `Session saved for ${args.domain}` });
    }

    case 'list': {
      const sessions = sessionManager.listSessions();
      return jsonResponse({ sessions });
    }

    case 'health': {
      if (args.domain) {
        const health = sessionManager.getSessionHealth(
          args.domain,
          args.sessionProfile || 'default'
        );
        return jsonResponse(health);
      } else {
        const allHealth = sessionManager.getAllSessionHealth();
        const summary = {
          total: allHealth.length,
          healthy: allHealth.filter(h => h.status === 'healthy').length,
          expiringSoon: allHealth.filter(h => h.status === 'expiring_soon').length,
          expired: allHealth.filter(h => h.status === 'expired').length,
          stale: allHealth.filter(h => h.status === 'stale').length,
        };
        return jsonResponse({ summary, sessions: allHealth });
      }
    }

    default:
      return errorResponse(`Unknown session_management action: ${action}`);
  }
}

/**
 * Handle execute_api_call tool call
 */
export async function handleExecuteApiCall(
  apiCallTool: ApiCallTool,
  args: {
    url: string;
    method?: string;
    headers?: Record<string, string>;
    body?: unknown;
    sessionProfile?: string;
  }
): Promise<McpResponse> {
  const result = await apiCallTool.execute(args.url, {
    method: args.method,
    headers: args.headers,
    body: args.body,
    sessionProfile: args.sessionProfile,
  });

  return jsonResponse(result);
}

/**
 * Handle get_browser_providers tool call
 */
export function handleGetBrowserProviders(browserManager: BrowserManager): McpResponse {
  const providers = BrowserManager.getAvailableProviders();
  const currentProvider = browserManager.getProvider();

  return jsonResponse({
    current: {
      type: currentProvider.type,
      name: currentProvider.name,
      capabilities: currentProvider.capabilities,
    },
    available: providers.map(p => ({
      type: p.type,
      name: p.name,
      configured: p.configured,
      capabilities: p.capabilities,
      envVars: p.envVars,
    })),
    recommendations: {
      antiBot:
        'Use Bright Data (BRIGHTDATA_AUTH) for sites with Cloudflare, CAPTCHAs, or aggressive anti-bot',
      costEffective: 'Use Browserless.io (BROWSERLESS_TOKEN) for standard hosted browser needs',
      noRemote: 'Use Local Playwright for development or when data privacy is critical',
    },
  });
}
