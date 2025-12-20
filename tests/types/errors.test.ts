/**
 * Tests for Error Taxonomy Types (CX-004)
 *
 * Validates the error classification, recommended actions, and retryability
 * determination for the structured error response system.
 */

import { describe, it, expect } from 'vitest';
import {
  classifyError,
  getRecommendedActions,
  isRetryable,
  buildStructuredError,
  type ErrorCategory,
  type ErrorCode,
} from '../../src/types/errors.js';

describe('errors', () => {
  describe('classifyError', () => {
    describe('network errors', () => {
      it('should classify timeout errors', () => {
        const result = classifyError('Request timed out after 30000ms');
        expect(result.category).toBe('network');
        expect(result.code).toBe('NETWORK_TIMEOUT');
      });

      it('should classify connection refused errors', () => {
        const result = classifyError('ECONNREFUSED: Connection refused');
        expect(result.category).toBe('network');
        expect(result.code).toBe('NETWORK_CONNECTION_REFUSED');
      });

      it('should classify DNS errors', () => {
        const result = classifyError('getaddrinfo ENOTFOUND example.com');
        expect(result.category).toBe('network');
        expect(result.code).toBe('NETWORK_DNS_FAILURE');
      });

      it('should classify socket errors', () => {
        const result = classifyError('ECONNRESET: socket hang up');
        expect(result.category).toBe('network');
        expect(result.code).toBe('NETWORK_SOCKET_ERROR');
      });

      it('should classify net:: errors', () => {
        const result = classifyError('net::ERR_CONNECTION_CLOSED');
        expect(result.category).toBe('network');
        expect(result.code).toBe('NETWORK_UNREACHABLE');
      });
    });

    describe('HTTP status errors', () => {
      it('should classify from explicit httpStatus context', () => {
        const result = classifyError('Request failed', { httpStatus: 404 });
        expect(result.category).toBe('http');
        expect(result.code).toBe('HTTP_NOT_FOUND');
        expect(result.httpStatus).toBe(404);
      });

      it('should classify 429 as rate limit', () => {
        const result = classifyError('Request failed', { httpStatus: 429 });
        expect(result.category).toBe('rate_limit');
        expect(result.code).toBe('RATE_LIMIT_EXCEEDED');
      });

      it('should classify 401 as auth error', () => {
        const result = classifyError('Request failed', { httpStatus: 401 });
        expect(result.category).toBe('auth');
        expect(result.code).toBe('AUTH_CREDENTIALS_INVALID');
      });

      it('should classify status code in message', () => {
        const result = classifyError('Server returned 503 Service Unavailable');
        expect(result.category).toBe('http');
        expect(result.code).toBe('HTTP_SERVICE_UNAVAILABLE');
        expect(result.httpStatus).toBe(503);
      });

      it('should classify 500 server errors', () => {
        const result = classifyError('Request failed', { httpStatus: 500 });
        expect(result.category).toBe('http');
        expect(result.code).toBe('HTTP_SERVER_ERROR');
      });
    });

    describe('security errors', () => {
      it('should classify from securityCategory context', () => {
        const result = classifyError('Blocked', { securityCategory: 'private_ip' });
        expect(result.category).toBe('security');
        expect(result.code).toBe('SECURITY_PRIVATE_IP');
      });

      it('should classify localhost security category', () => {
        const result = classifyError('Blocked', { securityCategory: 'localhost' });
        expect(result.category).toBe('security');
        expect(result.code).toBe('SECURITY_LOCALHOST');
      });

      it('should classify private IP from message', () => {
        const result = classifyError('Blocked private IP address: 192.168.1.1');
        expect(result.category).toBe('security');
        expect(result.code).toBe('SECURITY_PRIVATE_IP');
      });

      it('should classify blocked protocol from message', () => {
        const result = classifyError('Blocked protocol: file://');
        expect(result.category).toBe('security');
        expect(result.code).toBe('SECURITY_BLOCKED_PROTOCOL');
      });
    });

    describe('browser errors', () => {
      it('should classify playwright not installed', () => {
        const result = classifyError('Playwright is not installed');
        expect(result.category).toBe('browser');
        expect(result.code).toBe('BROWSER_NOT_INSTALLED');
      });

      it('should classify element not found', () => {
        const result = classifyError('Element not found: #content');
        expect(result.category).toBe('browser');
        expect(result.code).toBe('BROWSER_ELEMENT_NOT_FOUND');
      });

      it('should classify navigation failed', () => {
        const result = classifyError('Navigation failed: page crashed');
        expect(result.category).toBe('browser');
        expect(result.code).toBe('BROWSER_NAVIGATION_FAILED');
      });
    });

    describe('content errors', () => {
      it('should classify empty content', () => {
        const result = classifyError('Content too short to be useful');
        expect(result.category).toBe('content');
        expect(result.code).toBe('CONTENT_EMPTY');
      });

      it('should classify JS required', () => {
        const result = classifyError('Content requires JavaScript to render');
        expect(result.category).toBe('content');
        expect(result.code).toBe('CONTENT_REQUIRES_JS');
      });

      it('should classify extraction failed', () => {
        const result = classifyError('Content extraction failed');
        expect(result.category).toBe('content');
        expect(result.code).toBe('CONTENT_EXTRACTION_FAILED');
      });
    });

    describe('validation errors', () => {
      it('should classify incomplete render', () => {
        const result = classifyError('Content has incomplete render markers: Loading...');
        expect(result.category).toBe('validation');
        expect(result.code).toBe('VALIDATION_INCOMPLETE_RENDER');
      });
    });

    describe('auth errors', () => {
      it('should classify session expired', () => {
        const result = classifyError('Session has expired');
        expect(result.category).toBe('auth');
        expect(result.code).toBe('AUTH_SESSION_EXPIRED');
      });

      it('should classify credentials missing', () => {
        const result = classifyError('Credentials missing for API');
        expect(result.category).toBe('auth');
        expect(result.code).toBe('AUTH_CREDENTIALS_MISSING');
      });
    });

    describe('rate limit errors', () => {
      it('should classify rate limit exceeded', () => {
        const result = classifyError('Rate limit exceeded');
        expect(result.category).toBe('rate_limit');
        expect(result.code).toBe('RATE_LIMIT_EXCEEDED');
      });

      it('should classify too many requests', () => {
        const result = classifyError('Too many requests');
        expect(result.category).toBe('rate_limit');
        expect(result.code).toBe('RATE_LIMIT_EXCEEDED');
      });
    });

    describe('config errors', () => {
      it('should classify missing argument', () => {
        const result = classifyError('Missing argument: url');
        expect(result.category).toBe('config');
        expect(result.code).toBe('CONFIG_MISSING_ARGUMENT');
      });

      it('should classify unknown tool', () => {
        const result = classifyError('Unknown tool: foo_bar');
        expect(result.category).toBe('config');
        expect(result.code).toBe('CONFIG_UNKNOWN_TOOL');
      });

      it('should classify invalid URL', () => {
        const result = classifyError('Invalid URL provided');
        expect(result.category).toBe('config');
        expect(result.code).toBe('CONFIG_INVALID_URL');
      });
    });

    describe('blocked errors', () => {
      it('should classify captcha', () => {
        const result = classifyError('CAPTCHA detected');
        expect(result.category).toBe('blocked');
        expect(result.code).toBe('BLOCKED_CAPTCHA');
      });

      it('should classify challenge page', () => {
        const result = classifyError('Please verify you are human');
        expect(result.category).toBe('blocked');
        expect(result.code).toBe('BLOCKED_CHALLENGE_PAGE');
      });

      it('should classify bot detection', () => {
        const result = classifyError('Access denied - bot detection triggered');
        expect(result.category).toBe('blocked');
        expect(result.code).toBe('BLOCKED_BOT_DETECTION');
      });
    });

    describe('site change errors', () => {
      it('should classify selector outdated', () => {
        const result = classifyError('Selector not found - may be outdated');
        expect(result.category).toBe('site_change');
        expect(result.code).toBe('SITE_SELECTORS_OUTDATED');
      });

      it('should classify structure changed', () => {
        const result = classifyError('Site structure changed');
        expect(result.category).toBe('site_change');
        expect(result.code).toBe('SITE_STRUCTURE_CHANGED');
      });
    });

    describe('internal errors', () => {
      it('should classify unknown errors as internal', () => {
        const result = classifyError('Something unexpected happened');
        expect(result.category).toBe('internal');
        expect(result.code).toBe('INTERNAL_ERROR');
      });

      it('should classify skill errors', () => {
        const result = classifyError('Skill execution failed');
        expect(result.category).toBe('internal');
        expect(result.code).toBe('INTERNAL_SKILL_ERROR');
      });
    });

    it('should handle Error objects', () => {
      const error = new Error('Request timed out');
      const result = classifyError(error);
      expect(result.category).toBe('network');
      expect(result.code).toBe('NETWORK_TIMEOUT');
    });
  });

  describe('isRetryable', () => {
    it('should return true for network errors', () => {
      expect(isRetryable('network', 'NETWORK_TIMEOUT')).toBe(true);
      expect(isRetryable('network', 'NETWORK_CONNECTION_REFUSED')).toBe(true);
    });

    it('should return true for rate limit errors', () => {
      expect(isRetryable('rate_limit', 'RATE_LIMIT_EXCEEDED')).toBe(true);
    });

    it('should return true for temporary server errors', () => {
      expect(isRetryable('http', 'HTTP_BAD_GATEWAY')).toBe(true);
      expect(isRetryable('http', 'HTTP_SERVICE_UNAVAILABLE')).toBe(true);
      expect(isRetryable('http', 'HTTP_GATEWAY_TIMEOUT')).toBe(true);
    });

    it('should return true for session expired', () => {
      expect(isRetryable('auth', 'AUTH_SESSION_EXPIRED')).toBe(true);
    });

    it('should return true for content and validation errors', () => {
      expect(isRetryable('content', 'CONTENT_EMPTY')).toBe(true);
      expect(isRetryable('validation', 'VALIDATION_INCOMPLETE_RENDER')).toBe(true);
    });

    it('should return false for security errors', () => {
      expect(isRetryable('security', 'SECURITY_PRIVATE_IP')).toBe(false);
    });

    it('should return false for config errors', () => {
      expect(isRetryable('config', 'CONFIG_MISSING_ARGUMENT')).toBe(false);
    });

    it('should return false for 404/410', () => {
      expect(isRetryable('http', 'HTTP_NOT_FOUND')).toBe(false);
      expect(isRetryable('http', 'HTTP_GONE')).toBe(false);
    });

    it('should return false for browser not installed', () => {
      expect(isRetryable('browser', 'BROWSER_NOT_INSTALLED')).toBe(false);
    });
  });

  describe('getRecommendedActions', () => {
    it('should recommend retry for network errors', () => {
      const actions = getRecommendedActions('network', 'NETWORK_TIMEOUT');
      expect(actions.length).toBeGreaterThan(0);
      expect(actions[0].action).toBe('retry');
      expect(actions[0].suggestedDelayMs).toBe(2000);
    });

    it('should recommend increase_timeout for timeout errors', () => {
      const actions = getRecommendedActions('network', 'NETWORK_TIMEOUT');
      const increaseTimeout = actions.find(a => a.action === 'increase_timeout');
      expect(increaseTimeout).toBeDefined();
    });

    it('should recommend wait_and_retry for rate limit', () => {
      const actions = getRecommendedActions('rate_limit', 'RATE_LIMIT_EXCEEDED');
      expect(actions[0].action).toBe('wait_and_retry');
      expect(actions[0].suggestedDelayMs).toBe(30000);
    });

    it('should recommend refresh_session for auth errors', () => {
      const actions = getRecommendedActions('auth', 'AUTH_SESSION_EXPIRED');
      const refreshSession = actions.find(a => a.action === 'refresh_session');
      expect(refreshSession).toBeDefined();
      expect(refreshSession?.toolToUse).toBe('save_session');
    });

    it('should recommend use_browser_tier for JS required', () => {
      const actions = getRecommendedActions('content', 'CONTENT_REQUIRES_JS', { domain: 'example.com' });
      const useBrowser = actions.find(a => a.action === 'use_browser_tier');
      expect(useBrowser).toBeDefined();
      expect(useBrowser?.toolToUse).toBe('set_domain_tier');
    });

    it('should recommend install_playwright for browser not installed', () => {
      const actions = getRecommendedActions('browser', 'BROWSER_NOT_INSTALLED');
      const install = actions.find(a => a.action === 'install_playwright');
      expect(install).toBeDefined();
    });

    it('should recommend manual_intervention for captcha', () => {
      const actions = getRecommendedActions('blocked', 'BLOCKED_CAPTCHA');
      const manual = actions.find(a => a.action === 'manual_intervention');
      expect(manual).toBeDefined();
    });

    it('should recommend use_public_url for security errors', () => {
      const actions = getRecommendedActions('security', 'SECURITY_PRIVATE_IP');
      expect(actions[0].action).toBe('use_public_url');
    });

    it('should recommend check_parameters for config errors', () => {
      const actions = getRecommendedActions('config', 'CONFIG_MISSING_ARGUMENT');
      expect(actions[0].action).toBe('check_parameters');
    });

    it('should recommend browse_fresh for site changes', () => {
      const actions = getRecommendedActions('site_change', 'SITE_SELECTORS_OUTDATED');
      const browseFresh = actions.find(a => a.action === 'browse_fresh');
      expect(browseFresh).toBeDefined();
      expect(browseFresh?.parameters?.enableLearning).toBe(true);
    });

    it('should include domain context in parameters', () => {
      const actions = getRecommendedActions('auth', 'AUTH_SESSION_EXPIRED', { domain: 'api.example.com' });
      const checkHealth = actions.find(a => a.action === 'check_session_health');
      expect(checkHealth?.parameters?.domain).toBe('api.example.com');
    });

    it('should sort actions by priority', () => {
      const actions = getRecommendedActions('network', 'NETWORK_TIMEOUT');
      for (let i = 1; i < actions.length; i++) {
        expect(actions[i].priority).toBeGreaterThanOrEqual(actions[i - 1].priority);
      }
    });
  });

  describe('buildStructuredError', () => {
    it('should build complete structured error', () => {
      const error = buildStructuredError(
        'Request timed out after 30000ms',
        undefined,
        { url: 'https://example.com/api', domain: 'example.com' }
      );

      expect(error.error).toBe('Request timed out after 30000ms');
      expect(error.category).toBe('network');
      expect(error.code).toBe('NETWORK_TIMEOUT');
      expect(error.retryable).toBe(true);
      expect(error.recommendedActions.length).toBeGreaterThan(0);
      expect(error.context?.url).toBe('https://example.com/api');
      expect(error.context?.domain).toBe('example.com');
    });

    it('should handle Error objects', () => {
      const error = buildStructuredError(
        new Error('Connection refused'),
        undefined,
        undefined
      );

      expect(error.error).toBe('Connection refused');
      expect(error.category).toBe('network');
      expect(error.code).toBe('NETWORK_CONNECTION_REFUSED');
    });

    it('should include httpStatus when classified from status', () => {
      const error = buildStructuredError(
        'Not Found',
        { httpStatus: 404 },
        undefined
      );

      expect(error.httpStatus).toBe(404);
      expect(error.code).toBe('HTTP_NOT_FOUND');
      expect(error.retryable).toBe(false);
    });

    it('should use securityCategory from classification context', () => {
      const error = buildStructuredError(
        'Blocked private IP',
        { securityCategory: 'private_ip' },
        undefined
      );

      expect(error.category).toBe('security');
      expect(error.code).toBe('SECURITY_PRIVATE_IP');
      expect(error.retryable).toBe(false);
    });

    it('should include recommended actions with context', () => {
      const error = buildStructuredError(
        'Session expired',
        undefined,
        { domain: 'api.example.com' }
      );

      expect(error.recommendedActions.length).toBeGreaterThan(0);
      const checkHealth = error.recommendedActions.find(a => a.action === 'check_session_health');
      expect(checkHealth?.parameters?.domain).toBe('api.example.com');
    });
  });

  describe('backward compatibility', () => {
    it('should always include error message string', () => {
      const error = buildStructuredError('Something went wrong');
      expect(typeof error.error).toBe('string');
      expect(error.error).toBe('Something went wrong');
    });

    it('should always include category', () => {
      const error = buildStructuredError('Unknown error');
      expect(error.category).toBeDefined();
      expect(typeof error.category).toBe('string');
    });

    it('should always include code', () => {
      const error = buildStructuredError('Unknown error');
      expect(error.code).toBeDefined();
      expect(typeof error.code).toBe('string');
    });

    it('should always include retryable boolean', () => {
      const error = buildStructuredError('Unknown error');
      expect(typeof error.retryable).toBe('boolean');
    });

    it('should always include recommendedActions array', () => {
      const error = buildStructuredError('Unknown error');
      expect(Array.isArray(error.recommendedActions)).toBe(true);
    });
  });
});
