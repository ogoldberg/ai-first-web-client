/**
 * Tests for AuthFlowDetector (GAP-003)
 *
 * Tests auth challenge detection and resolution:
 * - HTTP 401/403 detection
 * - Login redirect detection
 * - Session expiration detection
 * - Auth message detection in response body
 * - Workflow replay integration
 * - Credential application fallback
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  AuthFlowDetector,
  authFlowDetector,
  type AuthChallenge,
  type AuthResolutionResult,
} from '../../src/core/auth-flow-detector.js';
import type { Workflow, WorkflowReplayResult } from '../../src/types/workflow.js';

describe('AuthFlowDetector', () => {
  let detector: AuthFlowDetector;

  beforeEach(() => {
    detector = new AuthFlowDetector();
  });

  describe('detectFromResponse', () => {
    describe('HTTP status code detection', () => {
      it('should detect HTTP 401 Unauthorized', () => {
        const result = detector.detectFromResponse(
          'https://api.example.com/protected',
          401,
          {}
        );

        expect(result).not.toBeNull();
        expect(result?.type).toBe('http_401');
        expect(result?.statusCode).toBe(401);
        expect(result?.domain).toBe('api.example.com');
        expect(result?.originalUrl).toBe('https://api.example.com/protected');
      });

      it('should detect HTTP 403 Forbidden', () => {
        const result = detector.detectFromResponse(
          'https://api.example.com/admin',
          403,
          {}
        );

        expect(result).not.toBeNull();
        expect(result?.type).toBe('http_403');
        expect(result?.statusCode).toBe(403);
        expect(result?.requiresUserAction).toBe(true);
      });

      it('should not trigger on successful responses', () => {
        const result = detector.detectFromResponse(
          'https://api.example.com/data',
          200,
          {}
        );

        expect(result).toBeNull();
      });

      it('should not trigger on client errors other than 401/403', () => {
        const result = detector.detectFromResponse(
          'https://api.example.com/notfound',
          404,
          {}
        );

        expect(result).toBeNull();
      });
    });

    describe('login redirect detection', () => {
      it('should detect redirect to /login', () => {
        const result = detector.detectFromResponse(
          'https://app.example.com/dashboard',
          302,
          { location: '/login' }
        );

        expect(result).not.toBeNull();
        expect(result?.type).toBe('login_redirect');
        expect(result?.redirectUrl).toBe('https://app.example.com/login');
      });

      it('should detect redirect to /signin', () => {
        const result = detector.detectFromResponse(
          'https://app.example.com/profile',
          302,
          { location: 'https://app.example.com/signin' }
        );

        expect(result).not.toBeNull();
        expect(result?.type).toBe('login_redirect');
      });

      it('should detect redirect to /auth with return param', () => {
        const result = detector.detectFromResponse(
          'https://app.example.com/settings',
          303,
          { location: '/auth?returnTo=/settings' }
        );

        expect(result).not.toBeNull();
        expect(result?.type).toBe('login_redirect');
      });

      it('should detect redirect with redirect query param', () => {
        const result = detector.detectFromResponse(
          'https://app.example.com/checkout',
          302,
          { location: '/account?redirect=/checkout' }
        );

        expect(result).not.toBeNull();
        expect(result?.type).toBe('login_redirect');
      });

      it('should not trigger on non-login redirects', () => {
        const result = detector.detectFromResponse(
          'https://app.example.com/old-page',
          302,
          { location: '/new-page' }
        );

        expect(result).toBeNull();
      });

      it('should handle 307 temporary redirect', () => {
        const result = detector.detectFromResponse(
          'https://app.example.com/api',
          307,
          { location: '/login' }
        );

        expect(result).not.toBeNull();
        expect(result?.type).toBe('login_redirect');
      });
    });

    describe('auth message detection in body', () => {
      it('should detect "please log in" message', () => {
        const result = detector.detectFromResponse(
          'https://app.example.com/protected',
          200,
          {},
          '<html><body>Please log in to continue</body></html>'
        );

        expect(result).not.toBeNull();
        expect(result?.type).toBe('auth_message');
      });

      it('should detect "login required" message', () => {
        const result = detector.detectFromResponse(
          'https://app.example.com/data',
          200,
          {},
          '{"error": "Login required to access this resource"}'
        );

        expect(result).not.toBeNull();
        expect(result?.type).toBe('auth_message');
      });

      it('should detect "session has expired" message', () => {
        const result = detector.detectFromResponse(
          'https://app.example.com/account',
          200,
          {},
          '<div class="error">Your session has expired. Please sign in again.</div>'
        );

        expect(result).not.toBeNull();
        expect(result?.type).toBe('auth_message');
      });

      it('should detect "access denied" message', () => {
        const result = detector.detectFromResponse(
          'https://app.example.com/admin',
          200,
          {},
          '<h1>Access Denied</h1><p>You do not have permission to view this page.</p>'
        );

        expect(result).not.toBeNull();
        expect(result?.type).toBe('auth_message');
      });

      it('should not trigger on normal content', () => {
        const result = detector.detectFromResponse(
          'https://app.example.com/home',
          200,
          {},
          '<html><body><h1>Welcome to our site!</h1></body></html>'
        );

        expect(result).toBeNull();
      });

      it('should only check first 10KB of body', () => {
        // Create a large body with auth message at the end
        const largeBody = 'x'.repeat(15000) + 'Please log in to continue';
        const result = detector.detectFromResponse(
          'https://app.example.com/page',
          200,
          {},
          largeBody
        );

        // Should not detect because message is beyond 10KB limit
        expect(result).toBeNull();
      });
    });
  });

  describe('detectFromRedirect', () => {
    it('should detect navigation to login page', () => {
      const result = detector.detectFromRedirect(
        'https://app.example.com/dashboard',
        'https://app.example.com/login'
      );

      expect(result).not.toBeNull();
      expect(result?.type).toBe('login_redirect');
      expect(result?.originalUrl).toBe('https://app.example.com/dashboard');
      expect(result?.redirectUrl).toBe('https://app.example.com/login');
    });

    it('should detect OAuth redirect', () => {
      const result = detector.detectFromRedirect(
        'https://app.example.com/connect',
        'https://auth.provider.com/oauth/authorize?client_id=xxx'
      );

      expect(result).not.toBeNull();
      expect(result?.type).toBe('login_redirect');
    });

    it('should not trigger on normal navigation', () => {
      const result = detector.detectFromRedirect(
        'https://app.example.com/products',
        'https://app.example.com/products/featured'
      );

      expect(result).toBeNull();
    });
  });

  describe('isLoginWorkflow', () => {
    it('should identify workflow with type "login"', () => {
      const workflow: Workflow = {
        id: 'wf-type-login',
        name: 'Some process',
        description: 'A workflow with an explicit login type',
        domain: 'app.example.com',
        tags: [],
        type: 'login',
        steps: [],
        version: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        usageCount: 0,
        successRate: 0,
      };

      expect(detector.isLoginWorkflow(workflow)).toBe(true);
    });

    it('should identify workflow with login tag', () => {
      const workflow: Workflow = {
        id: 'wf-1',
        name: 'GitHub Auth',
        description: 'Log into GitHub',
        domain: 'github.com',
        tags: ['login', 'github'],
        steps: [],
        version: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        usageCount: 0,
        successRate: 0,
      };

      expect(detector.isLoginWorkflow(workflow)).toBe(true);
    });

    it('should identify workflow with auth tag', () => {
      const workflow: Workflow = {
        id: 'wf-2',
        name: 'API Setup',
        description: 'Set up API access',
        domain: 'api.example.com',
        tags: ['auth', 'api'],
        steps: [],
        version: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        usageCount: 0,
        successRate: 0,
      };

      expect(detector.isLoginWorkflow(workflow)).toBe(true);
    });

    it('should identify workflow with login in name', () => {
      const workflow: Workflow = {
        id: 'wf-3',
        name: 'Login to Dashboard',
        description: 'Access the admin dashboard',
        domain: 'admin.example.com',
        tags: ['admin'],
        steps: [],
        version: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        usageCount: 0,
        successRate: 0,
      };

      expect(detector.isLoginWorkflow(workflow)).toBe(true);
    });

    it('should identify workflow with signin in name', () => {
      const workflow: Workflow = {
        id: 'wf-4',
        name: 'Sign In Flow',
        description: 'User sign in',
        domain: 'app.example.com',
        tags: [],
        steps: [],
        version: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        usageCount: 0,
        successRate: 0,
      };

      expect(detector.isLoginWorkflow(workflow)).toBe(true);
    });

    it('should identify workflow with first step to login URL', () => {
      const workflow: Workflow = {
        id: 'wf-5',
        name: 'Access Portal',
        description: 'Access the portal',
        domain: 'portal.example.com',
        tags: [],
        steps: [
          {
            stepNumber: 1,
            action: 'browse',
            url: 'https://portal.example.com/login',
            description: 'Navigate to login',
            importance: 'critical',
            success: true,
          },
        ],
        version: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        usageCount: 0,
        successRate: 0,
      };

      expect(detector.isLoginWorkflow(workflow)).toBe(true);
    });

    it('should not identify non-login workflow', () => {
      const workflow: Workflow = {
        id: 'wf-6',
        name: 'Scrape Products',
        description: 'Extract product data',
        domain: 'shop.example.com',
        tags: ['scraping', 'products'],
        steps: [
          {
            stepNumber: 1,
            action: 'browse',
            url: 'https://shop.example.com/products',
            description: 'Browse products',
            importance: 'critical',
            success: true,
          },
        ],
        version: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        usageCount: 0,
        successRate: 0,
      };

      expect(detector.isLoginWorkflow(workflow)).toBe(false);
    });
  });

  describe('markAsLoginWorkflow', () => {
    it('should add login and auth tags', () => {
      const workflow: Workflow = {
        id: 'wf-7',
        name: 'Access System',
        description: 'System access',
        domain: 'system.example.com',
        tags: ['system'],
        steps: [],
        version: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        usageCount: 0,
        successRate: 0,
      };

      detector.markAsLoginWorkflow(workflow);

      expect(workflow.tags).toContain('login');
      expect(workflow.tags).toContain('auth');
      expect(workflow.tags).toContain('system'); // Original tag preserved
    });

    it('should not duplicate login tag', () => {
      const workflow: Workflow = {
        id: 'wf-8',
        name: 'Login Flow',
        description: 'User login',
        domain: 'app.example.com',
        tags: ['login'],
        steps: [],
        version: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        usageCount: 0,
        successRate: 0,
      };

      detector.markAsLoginWorkflow(workflow);

      const loginCount = workflow.tags.filter(t => t === 'login').length;
      expect(loginCount).toBe(1);
    });
  });

  describe('resolveChallenge', () => {
    it('should return skipped when no dependencies configured', async () => {
      const challenge: AuthChallenge = {
        type: 'http_401',
        statusCode: 401,
        originalUrl: 'https://api.example.com/data',
        domain: 'api.example.com',
        timestamp: Date.now(),
      };

      const result = await detector.resolveChallenge(challenge);

      expect(result.success).toBe(false);
      expect(result.method).toBe('skipped');
      expect(result.retryRecommended).toBe(false);
    });

    it('should call user callback when configured', async () => {
      const userCallback = vi.fn().mockResolvedValue(true);
      const detectorWithCallback = new AuthFlowDetector({
        userCallback,
      });

      const challenge: AuthChallenge = {
        type: 'http_401',
        statusCode: 401,
        originalUrl: 'https://api.example.com/data',
        domain: 'api.example.com',
        timestamp: Date.now(),
      };

      const result = await detectorWithCallback.resolveChallenge(challenge);

      expect(userCallback).toHaveBeenCalledWith(
        challenge,
        'api.example.com',
        expect.arrayContaining(['bearer', 'api_key', 'basic'])
      );
      expect(result.success).toBe(true);
      expect(result.method).toBe('user_prompt');
      expect(result.retryRecommended).toBe(true);
    });

    it('should handle user callback returning false', async () => {
      const userCallback = vi.fn().mockResolvedValue(false);
      const detectorWithCallback = new AuthFlowDetector({
        userCallback,
      });

      const challenge: AuthChallenge = {
        type: 'http_401',
        statusCode: 401,
        originalUrl: 'https://api.example.com/data',
        domain: 'api.example.com',
        timestamp: Date.now(),
      };

      const result = await detectorWithCallback.resolveChallenge(challenge);

      expect(result.success).toBe(false);
      expect(result.method).toBe('skipped');
    });

    it('should handle user callback throwing error', async () => {
      const userCallback = vi.fn().mockRejectedValue(new Error('User cancelled'));
      const detectorWithCallback = new AuthFlowDetector({
        userCallback,
      });

      const challenge: AuthChallenge = {
        type: 'http_401',
        statusCode: 401,
        originalUrl: 'https://api.example.com/data',
        domain: 'api.example.com',
        timestamp: Date.now(),
      };

      const result = await detectorWithCallback.resolveChallenge(challenge);

      expect(result.success).toBe(false);
      expect(result.method).toBe('skipped');
    });
  });

  describe('challenge type credential suggestions', () => {
    it('should suggest appropriate credentials for HTTP 401', () => {
      const challenge: AuthChallenge = {
        type: 'http_401',
        statusCode: 401,
        originalUrl: 'https://api.example.com/data',
        domain: 'api.example.com',
        timestamp: Date.now(),
      };

      const userCallback = vi.fn().mockResolvedValue(false);
      const detectorWithCallback = new AuthFlowDetector({ userCallback });
      detectorWithCallback.resolveChallenge(challenge);

      expect(userCallback).toHaveBeenCalledWith(
        challenge,
        'api.example.com',
        expect.arrayContaining(['bearer', 'api_key', 'basic'])
      );
    });

    it('should suggest appropriate credentials for login redirect', () => {
      const challenge: AuthChallenge = {
        type: 'login_redirect',
        redirectUrl: 'https://app.example.com/login',
        originalUrl: 'https://app.example.com/dashboard',
        domain: 'app.example.com',
        timestamp: Date.now(),
      };

      const userCallback = vi.fn().mockResolvedValue(false);
      const detectorWithCallback = new AuthFlowDetector({ userCallback });
      detectorWithCallback.resolveChallenge(challenge);

      expect(userCallback).toHaveBeenCalledWith(
        challenge,
        'app.example.com',
        expect.arrayContaining(['cookie', 'oauth'])
      );
    });

    it('should suggest appropriate credentials for session expired', () => {
      const challenge: AuthChallenge = {
        type: 'session_expired',
        originalUrl: 'https://app.example.com',
        domain: 'app.example.com',
        timestamp: Date.now(),
      };

      const userCallback = vi.fn().mockResolvedValue(false);
      const detectorWithCallback = new AuthFlowDetector({ userCallback });
      detectorWithCallback.resolveChallenge(challenge);

      expect(userCallback).toHaveBeenCalledWith(
        challenge,
        'app.example.com',
        expect.arrayContaining(['cookie'])
      );
    });
  });

  describe('singleton export', () => {
    it('should export a default instance', () => {
      expect(authFlowDetector).toBeInstanceOf(AuthFlowDetector);
    });
  });
});

describe('WorkflowType integration', () => {
  it('should support workflow type field', async () => {
    const workflow: Workflow = {
      id: 'wf-login-1',
      name: 'GitHub Login',
      description: 'Log into GitHub',
      domain: 'github.com',
      tags: ['login'],
      type: 'login', // New type field
      steps: [
        {
          stepNumber: 1,
          action: 'browse',
          url: 'https://github.com/login',
          description: 'Navigate to login page',
          importance: 'critical',
          success: true,
        },
      ],
      version: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      usageCount: 0,
      successRate: 0,
    };

    expect(workflow.type).toBe('login');
  });

  it('should allow other workflow types', () => {
    const checkoutWorkflow: Workflow = {
      id: 'wf-checkout-1',
      name: 'Amazon Checkout',
      description: 'Complete checkout process',
      domain: 'amazon.com',
      tags: ['checkout', 'ecommerce'],
      type: 'checkout',
      steps: [],
      version: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      usageCount: 0,
      successRate: 0,
    };

    expect(checkoutWorkflow.type).toBe('checkout');
  });

  it('should default to undefined (general) when not specified', () => {
    const workflow: Workflow = {
      id: 'wf-general-1',
      name: 'Generic Workflow',
      description: 'A general workflow',
      domain: 'example.com',
      tags: [],
      steps: [],
      version: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      usageCount: 0,
      successRate: 0,
    };

    expect(workflow.type).toBeUndefined();
  });
});
