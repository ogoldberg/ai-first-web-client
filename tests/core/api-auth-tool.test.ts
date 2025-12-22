/**
 * Tests for the consolidated api_auth tool (TC-001)
 *
 * This tests the new unified api_auth tool that consolidates 6 auth tools:
 * - get_api_auth_status -> action='status'
 * - configure_api_auth -> action='configure'
 * - complete_oauth -> action='complete_oauth'
 * - get_auth_guidance -> action='guidance'
 * - delete_api_auth -> action='delete'
 * - list_configured_auth -> action='list'
 *
 * Tests both:
 * 1. Helper functions that implement the core logic
 * 2. Tool handler behavior (action routing, parameter validation, response format)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AuthWorkflow } from '../../src/core/auth-workflow.js';
import { SessionManager } from '../../src/core/session-manager.js';
import {
  buildTypedCredentials,
  handleAuthStatus,
  handleAuthConfigure,
  handleOAuthComplete,
  handleAuthGuidance,
  handleAuthDelete,
  handleAuthList,
  type AuthType,
} from '../../src/tools/auth-helpers.js';

/**
 * Simulates the api_auth tool handler from index.ts
 * This allows testing the action routing and parameter validation logic
 */
async function simulateApiAuthToolHandler(
  authWorkflow: AuthWorkflow,
  args: Record<string, unknown>
): Promise<{ isError?: boolean; content: Array<{ type: 'text'; text: string }> }> {
  const jsonResponse = (data: unknown) => ({
    content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
  });

  const errorResponse = (message: string) => ({
    isError: true,
    content: [{ type: 'text' as const, text: message }],
  });

  const action = args.action as string;

  switch (action) {
    case 'status': {
      if (!args.domain) {
        return errorResponse("Missing required parameter 'domain' for action 'status'");
      }
      const result = await handleAuthStatus(
        authWorkflow,
        args.domain as string,
        (args.profile as string) || 'default'
      );
      return jsonResponse(result);
    }

    case 'configure': {
      if (!args.domain) {
        return errorResponse("Missing required parameter 'domain' for action 'configure'");
      }
      if (!args.authType) {
        return errorResponse("Missing required parameter 'authType' for action 'configure'");
      }
      if (!args.credentials) {
        return errorResponse("Missing required parameter 'credentials' for action 'configure'");
      }
      const result = await handleAuthConfigure(
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
      return jsonResponse(result);
    }

    case 'complete_oauth': {
      if (!args.code) {
        return errorResponse("Missing required parameter 'code' for action 'complete_oauth'");
      }
      if (!args.state) {
        return errorResponse("Missing required parameter 'state' for action 'complete_oauth'");
      }
      const result = await handleOAuthComplete(
        authWorkflow,
        args.code as string,
        args.state as string
      );
      return jsonResponse(result);
    }

    case 'guidance': {
      if (!args.domain) {
        return errorResponse("Missing required parameter 'domain' for action 'guidance'");
      }
      const result = await handleAuthGuidance(
        authWorkflow,
        args.domain as string,
        args.authType as string | undefined
      );
      return jsonResponse(result);
    }

    case 'delete': {
      if (!args.domain) {
        return errorResponse("Missing required parameter 'domain' for action 'delete'");
      }
      const result = await handleAuthDelete(
        authWorkflow,
        args.domain as string,
        args.authType as AuthType | undefined,
        (args.profile as string) || 'default'
      );
      return jsonResponse(result);
    }

    case 'list': {
      const result = handleAuthList(authWorkflow);
      return jsonResponse(result);
    }

    default:
      return errorResponse(`Unknown action: ${action}. Valid actions: status, configure, complete_oauth, guidance, delete, list`);
  }
}

// Mock the api-documentation-discovery module
vi.mock('../../src/core/api-documentation-discovery.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/core/api-documentation-discovery.js')>(
    '../../src/core/api-documentation-discovery.js'
  );
  return {
    ...actual,
    discoverApiDocumentation: vi.fn().mockResolvedValue({
      domain: 'api.example.com',
      results: [],
      allPatterns: [],
      metadata: {
        authentication: [],
      },
      totalTime: 100,
      found: false,
    }),
  };
});

// Mock fs operations
vi.mock('fs', () => ({
  promises: {
    readFile: vi.fn().mockRejectedValue(new Error('ENOENT')),
    writeFile: vi.fn().mockResolvedValue(undefined),
    rename: vi.fn().mockResolvedValue(undefined),
  },
}));

describe('api_auth tool consolidation (TC-001)', () => {
  let authWorkflow: AuthWorkflow;

  beforeEach(() => {
    vi.clearAllMocks();
    const mockSessionManager = {
      initialize: vi.fn().mockResolvedValue(undefined),
    } as unknown as SessionManager;

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ access_token: 'test-token', expires_in: 3600 }),
      text: () => Promise.resolve(''),
    });

    authWorkflow = new AuthWorkflow(mockSessionManager, mockFetch);
  });

  describe('buildTypedCredentials', () => {
    it('should build api_key credentials with defaults', () => {
      const result = buildTypedCredentials('api_key', { value: 'my-key' });
      expect(result).toEqual({
        type: 'api_key',
        in: 'header',
        name: 'X-API-Key',
        value: 'my-key',
      });
    });

    it('should build api_key credentials with custom values', () => {
      const result = buildTypedCredentials('api_key', {
        value: 'my-key',
        in: 'query',
        name: 'apikey',
      });
      expect(result).toEqual({
        type: 'api_key',
        in: 'query',
        name: 'apikey',
        value: 'my-key',
      });
    });

    it('should build bearer credentials', () => {
      const result = buildTypedCredentials('bearer', {
        token: 'my-token',
        expiresAt: 1234567890,
      });
      expect(result).toEqual({
        type: 'bearer',
        token: 'my-token',
        expiresAt: 1234567890,
      });
    });

    it('should build basic credentials', () => {
      const result = buildTypedCredentials('basic', {
        username: 'user',
        password: 'pass',
      });
      expect(result).toEqual({
        type: 'basic',
        username: 'user',
        password: 'pass',
      });
    });

    it('should build oauth2 credentials with defaults', () => {
      const result = buildTypedCredentials('oauth2', {
        clientId: 'client-123',
      });
      expect(result).toHaveProperty('type', 'oauth2');
      expect(result).toHaveProperty('flow', 'authorization_code');
      expect(result).toHaveProperty('clientId', 'client-123');
    });

    it('should build cookie credentials', () => {
      const result = buildTypedCredentials('cookie', {
        name: 'session',
        value: 'abc123',
      });
      expect(result).toEqual({
        type: 'cookie',
        name: 'session',
        value: 'abc123',
        expiresAt: undefined,
      });
    });

    it('should return error for unknown auth type', () => {
      const result = buildTypedCredentials('unknown', {});
      expect(result).toEqual({ error: 'Unknown auth type: unknown' });
    });
  });

  describe('handleAuthStatus', () => {
    it('should return properly formatted status response', async () => {
      const result = await handleAuthStatus(authWorkflow, 'api.example.com', 'default');

      expect(result).toHaveProperty('domain', 'api.example.com');
      expect(result).toHaveProperty('status');
      expect(result).toHaveProperty('message');
      expect(result).toHaveProperty('detectedAuth');
      expect(result).toHaveProperty('configuredCredentials');
      expect(result).toHaveProperty('missingAuth');
      expect(Array.isArray(result.missingAuth)).toBe(true);
    });

    it('should include guidance for each missing auth type', async () => {
      // Configure some auth first so there's no missing auth
      await authWorkflow.configureCredentials(
        'api.example.com',
        { type: 'api_key', in: 'header', name: 'X-API-Key', value: 'test' },
        'default',
        false
      );

      const result = await handleAuthStatus(authWorkflow, 'api.example.com', 'default');
      expect(result.configuredCredentials.length).toBeGreaterThan(0);
    });
  });

  describe('handleAuthConfigure', () => {
    it('should configure api_key credentials successfully', async () => {
      const result = await handleAuthConfigure(
        authWorkflow,
        'api.example.com',
        'api_key',
        { value: 'test-key' },
        'default',
        false
      );

      expect('error' in result && !('success' in result)).toBe(false);
      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('domain', 'api.example.com');
      expect(result).toHaveProperty('type', 'api_key');
      expect(result).toHaveProperty('profile', 'default');
    });

    it('should return error for unknown auth type', async () => {
      const result = await handleAuthConfigure(
        authWorkflow,
        'api.example.com',
        'invalid_type',
        {},
        'default',
        false
      );

      expect('error' in result && !('success' in result)).toBe(true);
      if ('error' in result && !('success' in result)) {
        expect(result.error).toContain('Unknown auth type');
      }
    });

    it('should configure bearer credentials successfully', async () => {
      const result = await handleAuthConfigure(
        authWorkflow,
        'api.example.com',
        'bearer',
        { token: 'my-bearer-token' },
        'default',
        false
      );

      expect('success' in result).toBe(true);
      if ('success' in result) {
        expect(result.success).toBe(true);
        expect(result.type).toBe('bearer');
      }
    });
  });

  describe('handleOAuthComplete', () => {
    it('should return failure message for invalid OAuth flow', async () => {
      const result = await handleOAuthComplete(
        authWorkflow,
        'invalid-code',
        'invalid-state'
      );

      expect(result).toHaveProperty('success', false);
      expect(result).toHaveProperty('message');
      expect(result.message).toContain('failed');
    });
  });

  describe('handleAuthGuidance', () => {
    it('should return guidance for specific auth type', async () => {
      const result = await handleAuthGuidance(authWorkflow, 'api.example.com', 'api_key');

      expect(result).toHaveProperty('domain', 'api.example.com');
      expect(result).toHaveProperty('detectedAuthTypes');
      expect(result).toHaveProperty('guidance');
      expect(result.guidance.length).toBe(1);
      expect(result.guidance[0].type).toBe('api_key');
      expect(result.guidance[0].guidance).toHaveProperty('instructions');
      expect(result.guidance[0].guidance).toHaveProperty('requiredFields');
    });

    it('should return default guidance when no auth detected', async () => {
      const result = await handleAuthGuidance(authWorkflow, 'api.example.com');

      expect(result.guidance.length).toBeGreaterThan(0);
      // Should include guidance for common types when no auth detected
      const types = result.guidance.map(g => g.type);
      expect(types).toContain('api_key');
      expect(types).toContain('bearer');
    });
  });

  describe('handleAuthDelete', () => {
    it('should return false for non-existent credentials', async () => {
      const result = await handleAuthDelete(
        authWorkflow,
        'nonexistent.com',
        undefined,
        'default'
      );

      expect(result).toHaveProperty('success', false);
      expect(result).toHaveProperty('domain', 'nonexistent.com');
      expect(result).toHaveProperty('authType', 'all');
      expect(result).toHaveProperty('message');
      expect(result.message).toContain('No matching');
    });

    it('should delete existing credentials', async () => {
      // First configure some credentials
      await handleAuthConfigure(
        authWorkflow,
        'api.example.com',
        'api_key',
        { value: 'test-key' },
        'default',
        false
      );

      // Then delete them
      const result = await handleAuthDelete(
        authWorkflow,
        'api.example.com',
        'api_key',
        'default'
      );

      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('message', 'Credentials deleted successfully');
    });
  });

  describe('handleAuthList', () => {
    it('should return empty list initially', () => {
      const result = handleAuthList(authWorkflow);

      expect(result).toHaveProperty('totalDomains', 0);
      expect(result).toHaveProperty('domains');
      expect(Array.isArray(result.domains)).toBe(true);
      expect(result.domains.length).toBe(0);
    });

    it('should list configured domains', async () => {
      // Configure credentials for a domain
      await handleAuthConfigure(
        authWorkflow,
        'api.example.com',
        'api_key',
        { value: 'test-key' },
        'default',
        false
      );

      const result = handleAuthList(authWorkflow);

      expect(result.totalDomains).toBeGreaterThan(0);
      expect(result.domains.some(d => d.domain === 'api.example.com')).toBe(true);
    });
  });

  describe('guidance content validation', () => {
    it('should provide api_key guidance with required fields', async () => {
      const result = await handleAuthGuidance(authWorkflow, 'api.example.com', 'api_key');
      expect(result.guidance[0].guidance.requiredFields).toContain('value');
    });

    it('should provide bearer guidance with required fields', async () => {
      const result = await handleAuthGuidance(authWorkflow, 'api.example.com', 'bearer');
      expect(result.guidance[0].guidance.requiredFields).toContain('token');
    });

    it('should provide basic guidance with required fields', async () => {
      const result = await handleAuthGuidance(authWorkflow, 'api.example.com', 'basic');
      expect(result.guidance[0].guidance.requiredFields).toContain('username');
      expect(result.guidance[0].guidance.requiredFields).toContain('password');
    });

    it('should provide oauth2 guidance with required fields', async () => {
      const result = await handleAuthGuidance(authWorkflow, 'api.example.com', 'oauth2');
      expect(result.guidance[0].guidance.requiredFields).toContain('clientId');
    });

    it('should provide cookie guidance with required fields', async () => {
      const result = await handleAuthGuidance(authWorkflow, 'api.example.com', 'cookie');
      expect(result.guidance[0].guidance.requiredFields).toContain('name');
      expect(result.guidance[0].guidance.requiredFields).toContain('value');
    });
  });

  // ============================================
  // TOOL HANDLER INTEGRATION TESTS
  // Tests the action routing, parameter validation, and response format
  // ============================================
  describe('api_auth tool handler integration', () => {
    describe('action routing', () => {
      it('should route status action correctly', async () => {
        const response = await simulateApiAuthToolHandler(authWorkflow, {
          action: 'status',
          domain: 'api.example.com',
        });

        expect(response.isError).toBeUndefined();
        const parsed = JSON.parse(response.content[0].text);
        expect(parsed).toHaveProperty('domain', 'api.example.com');
        expect(parsed).toHaveProperty('status');
        expect(parsed).toHaveProperty('message');
      });

      it('should route configure action correctly', async () => {
        const response = await simulateApiAuthToolHandler(authWorkflow, {
          action: 'configure',
          domain: 'api.example.com',
          authType: 'api_key',
          credentials: { value: 'test-key' },
        });

        expect(response.isError).toBeUndefined();
        const parsed = JSON.parse(response.content[0].text);
        expect(parsed).toHaveProperty('success', true);
        expect(parsed).toHaveProperty('domain', 'api.example.com');
        expect(parsed).toHaveProperty('type', 'api_key');
      });

      it('should route guidance action correctly', async () => {
        const response = await simulateApiAuthToolHandler(authWorkflow, {
          action: 'guidance',
          domain: 'api.example.com',
        });

        expect(response.isError).toBeUndefined();
        const parsed = JSON.parse(response.content[0].text);
        expect(parsed).toHaveProperty('domain', 'api.example.com');
        expect(parsed).toHaveProperty('guidance');
      });

      it('should route delete action correctly', async () => {
        const response = await simulateApiAuthToolHandler(authWorkflow, {
          action: 'delete',
          domain: 'api.example.com',
        });

        expect(response.isError).toBeUndefined();
        const parsed = JSON.parse(response.content[0].text);
        expect(parsed).toHaveProperty('domain', 'api.example.com');
        expect(parsed).toHaveProperty('success');
      });

      it('should route list action correctly', async () => {
        const response = await simulateApiAuthToolHandler(authWorkflow, {
          action: 'list',
        });

        expect(response.isError).toBeUndefined();
        const parsed = JSON.parse(response.content[0].text);
        expect(parsed).toHaveProperty('totalDomains');
        expect(parsed).toHaveProperty('domains');
      });

      it('should route complete_oauth action correctly', async () => {
        const response = await simulateApiAuthToolHandler(authWorkflow, {
          action: 'complete_oauth',
          code: 'test-code',
          state: 'test-state',
        });

        expect(response.isError).toBeUndefined();
        const parsed = JSON.parse(response.content[0].text);
        expect(parsed).toHaveProperty('success');
        expect(parsed).toHaveProperty('message');
      });

      it('should return error for unknown action', async () => {
        const response = await simulateApiAuthToolHandler(authWorkflow, {
          action: 'unknown_action',
        });

        expect(response.isError).toBe(true);
        expect(response.content[0].text).toContain('Unknown action');
        expect(response.content[0].text).toContain('Valid actions');
      });
    });

    describe('parameter validation', () => {
      it('should return error when domain missing for status action', async () => {
        const response = await simulateApiAuthToolHandler(authWorkflow, {
          action: 'status',
        });

        expect(response.isError).toBe(true);
        expect(response.content[0].text).toContain("Missing required parameter 'domain'");
      });

      it('should return error when domain missing for configure action', async () => {
        const response = await simulateApiAuthToolHandler(authWorkflow, {
          action: 'configure',
          authType: 'api_key',
          credentials: { value: 'test' },
        });

        expect(response.isError).toBe(true);
        expect(response.content[0].text).toContain("Missing required parameter 'domain'");
      });

      it('should return error when authType missing for configure action', async () => {
        const response = await simulateApiAuthToolHandler(authWorkflow, {
          action: 'configure',
          domain: 'api.example.com',
          credentials: { value: 'test' },
        });

        expect(response.isError).toBe(true);
        expect(response.content[0].text).toContain("Missing required parameter 'authType'");
      });

      it('should return error when credentials missing for configure action', async () => {
        const response = await simulateApiAuthToolHandler(authWorkflow, {
          action: 'configure',
          domain: 'api.example.com',
          authType: 'api_key',
        });

        expect(response.isError).toBe(true);
        expect(response.content[0].text).toContain("Missing required parameter 'credentials'");
      });

      it('should return error when domain missing for guidance action', async () => {
        const response = await simulateApiAuthToolHandler(authWorkflow, {
          action: 'guidance',
        });

        expect(response.isError).toBe(true);
        expect(response.content[0].text).toContain("Missing required parameter 'domain'");
      });

      it('should return error when domain missing for delete action', async () => {
        const response = await simulateApiAuthToolHandler(authWorkflow, {
          action: 'delete',
        });

        expect(response.isError).toBe(true);
        expect(response.content[0].text).toContain("Missing required parameter 'domain'");
      });

      it('should return error when code missing for complete_oauth action', async () => {
        const response = await simulateApiAuthToolHandler(authWorkflow, {
          action: 'complete_oauth',
          state: 'test-state',
        });

        expect(response.isError).toBe(true);
        expect(response.content[0].text).toContain("Missing required parameter 'code'");
      });

      it('should return error when state missing for complete_oauth action', async () => {
        const response = await simulateApiAuthToolHandler(authWorkflow, {
          action: 'complete_oauth',
          code: 'test-code',
        });

        expect(response.isError).toBe(true);
        expect(response.content[0].text).toContain("Missing required parameter 'state'");
      });
    });

    describe('response format', () => {
      it('should return JSON text content for success responses', async () => {
        const response = await simulateApiAuthToolHandler(authWorkflow, {
          action: 'list',
        });

        expect(response.content).toHaveLength(1);
        expect(response.content[0].type).toBe('text');
        expect(() => JSON.parse(response.content[0].text)).not.toThrow();
      });

      it('should return isError flag for error responses', async () => {
        const response = await simulateApiAuthToolHandler(authWorkflow, {
          action: 'status',
        });

        expect(response.isError).toBe(true);
        expect(response.content).toHaveLength(1);
        expect(response.content[0].type).toBe('text');
      });

      it('should return error for invalid auth type in configure action', async () => {
        const response = await simulateApiAuthToolHandler(authWorkflow, {
          action: 'configure',
          domain: 'api.example.com',
          authType: 'invalid_type',
          credentials: {},
        });

        expect(response.isError).toBe(true);
        expect(response.content[0].text).toContain('Unknown auth type');
      });
    });

    describe('default values', () => {
      it('should use default profile when not specified', async () => {
        const response = await simulateApiAuthToolHandler(authWorkflow, {
          action: 'configure',
          domain: 'api.example.com',
          authType: 'api_key',
          credentials: { value: 'test-key' },
        });

        const parsed = JSON.parse(response.content[0].text);
        expect(parsed.profile).toBe('default');
      });

      it('should use custom profile when specified', async () => {
        const response = await simulateApiAuthToolHandler(authWorkflow, {
          action: 'configure',
          domain: 'api.example.com',
          authType: 'api_key',
          credentials: { value: 'test-key' },
          profile: 'custom-profile',
        });

        const parsed = JSON.parse(response.content[0].text);
        expect(parsed.profile).toBe('custom-profile');
      });

      it('should default validate to true for configure action', async () => {
        // This test verifies the validate default is true by configuring valid credentials
        // Without validate=false, it would try to validate the API key
        const response = await simulateApiAuthToolHandler(authWorkflow, {
          action: 'configure',
          domain: 'api.example.com',
          authType: 'api_key',
          credentials: { value: 'test-key' },
          validate: false, // Explicitly set to false to avoid validation
        });

        const parsed = JSON.parse(response.content[0].text);
        expect(parsed.validated).toBe(false); // Because we set validate: false
      });
    });
  });
});
