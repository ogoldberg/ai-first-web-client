/**
 * Tests for the structured logger with secret redaction
 *
 * Tests cover:
 * - Log levels
 * - Secret redaction (authorization, cookie, tokens, etc.)
 * - Component loggers
 * - Child loggers with context
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('Logger', () => {
  let logOutput: string[];
  let originalStderr: typeof process.stderr.write;

  beforeEach(() => {
    // Reset module cache to get fresh logger instance
    vi.resetModules();

    logOutput = [];
    originalStderr = process.stderr.write;
    // Capture stderr output
    process.stderr.write = ((chunk: string | Uint8Array) => {
      if (typeof chunk === 'string') {
        logOutput.push(chunk);
      } else {
        logOutput.push(Buffer.from(chunk).toString());
      }
      return true;
    }) as typeof process.stderr.write;
  });

  afterEach(() => {
    process.stderr.write = originalStderr;
  });

  describe('Secret Redaction', () => {
    it('should redact authorization headers', async () => {
      const { logger, configureLogger } = await import('../../src/utils/logger.js');
      configureLogger({ level: 'debug', prettyPrint: false });

      logger.browser.info('Request made', {
        headers: {
          authorization: 'Bearer secret-token-12345',
          'content-type': 'application/json',
        },
      });

      // Wait for async logging
      await new Promise(resolve => setTimeout(resolve, 50));

      const output = logOutput.join('');
      expect(output).toContain('[REDACTED]');
      expect(output).not.toContain('secret-token-12345');
      expect(output).toContain('application/json'); // Non-secret should be visible
    });

    it('should redact cookie headers', async () => {
      const { logger, configureLogger } = await import('../../src/utils/logger.js');
      configureLogger({ level: 'debug', prettyPrint: false });

      logger.session.info('Session data', {
        headers: {
          cookie: 'session=abc123; auth_token=xyz789',
        },
      });

      await new Promise(resolve => setTimeout(resolve, 50));

      const output = logOutput.join('');
      expect(output).toContain('[REDACTED]');
      expect(output).not.toContain('abc123');
      expect(output).not.toContain('xyz789');
    });

    it('should redact password fields', async () => {
      const { logger, configureLogger } = await import('../../src/utils/logger.js');
      configureLogger({ level: 'debug', prettyPrint: false });

      logger.server.warn('Login attempt', {
        user: {
          email: 'user@example.com',
          password: 'super-secret-password',
        },
      });

      await new Promise(resolve => setTimeout(resolve, 50));

      const output = logOutput.join('');
      expect(output).toContain('[REDACTED]');
      expect(output).not.toContain('super-secret-password');
      expect(output).toContain('user@example.com'); // Email should be visible
    });

    it('should redact apiKey and token fields', async () => {
      const { logger, configureLogger } = await import('../../src/utils/logger.js');
      configureLogger({ level: 'debug', prettyPrint: false });

      logger.apiCall.info('API call made', {
        config: {
          apiKey: 'sk-12345-abcdef',
          token: 'jwt-token-here',
          endpoint: 'https://api.example.com',
        },
      });

      await new Promise(resolve => setTimeout(resolve, 50));

      const output = logOutput.join('');
      expect(output).toContain('[REDACTED]');
      expect(output).not.toContain('sk-12345-abcdef');
      expect(output).not.toContain('jwt-token-here');
      expect(output).toContain('https://api.example.com'); // Endpoint should be visible
    });

    it('should redact requestHeaders and responseHeaders', async () => {
      const { logger, configureLogger } = await import('../../src/utils/logger.js');
      configureLogger({ level: 'debug', prettyPrint: false });

      logger.browser.debug('Network request', {
        requestHeaders: {
          authorization: 'Basic dXNlcjpwYXNz',
          'user-agent': 'Mozilla/5.0',
        },
        responseHeaders: {
          'set-cookie': 'session=secret123; HttpOnly',
          'content-type': 'text/html',
        },
      });

      await new Promise(resolve => setTimeout(resolve, 50));

      const output = logOutput.join('');
      expect(output).toContain('[REDACTED]');
      expect(output).not.toContain('dXNlcjpwYXNz');
      expect(output).not.toContain('secret123');
      expect(output).toContain('Mozilla/5.0'); // User-agent should be visible
    });

    it('should redact access_token and refresh_token', async () => {
      const { logger, configureLogger } = await import('../../src/utils/logger.js');
      configureLogger({ level: 'debug', prettyPrint: false });

      logger.session.info('OAuth tokens', {
        oauth: {
          access_token: 'ya29.access-token-here',
          refresh_token: '1//refresh-token-here',
          expires_in: 3600,
        },
      });

      await new Promise(resolve => setTimeout(resolve, 50));

      const output = logOutput.join('');
      expect(output).toContain('[REDACTED]');
      expect(output).not.toContain('ya29.access-token-here');
      expect(output).not.toContain('1//refresh-token-here');
      expect(output).toContain('3600'); // Expiry should be visible
    });
  });

  describe('Component Loggers', () => {
    it('should include component in log output', async () => {
      const { logger, configureLogger } = await import('../../src/utils/logger.js');
      configureLogger({ level: 'info', prettyPrint: false });

      logger.browser.info('Test message');
      await new Promise(resolve => setTimeout(resolve, 50));

      const output = logOutput.join('');
      expect(output).toContain('BrowserManager');
      expect(output).toContain('Test message');
    });
  });

  describe('Child Loggers', () => {
    it('should inherit redaction from parent', async () => {
      const { logger, configureLogger } = await import('../../src/utils/logger.js');
      configureLogger({ level: 'debug', prettyPrint: false });

      const childLogger = logger.browser.child({ domain: 'example.com' });
      childLogger.info('Child log with secret', {
        data: {
          apiKey: 'child-api-key-123',
          value: 'public-data',
        },
      });

      await new Promise(resolve => setTimeout(resolve, 50));

      const output = logOutput.join('');
      expect(output).toContain('[REDACTED]');
      expect(output).not.toContain('child-api-key-123');
      expect(output).toContain('public-data');
      expect(output).toContain('example.com');
    });
  });

  describe('Log Levels', () => {
    it('should respect log level configuration', async () => {
      const { logger, configureLogger } = await import('../../src/utils/logger.js');
      configureLogger({ level: 'warn', prettyPrint: false });

      logger.browser.debug('Debug message');
      logger.browser.info('Info message');
      logger.browser.warn('Warn message');
      logger.browser.error('Error message');

      await new Promise(resolve => setTimeout(resolve, 50));

      const output = logOutput.join('');
      expect(output).not.toContain('Debug message');
      expect(output).not.toContain('Info message');
      expect(output).toContain('Warn message');
      expect(output).toContain('Error message');
    });
  });

  describe('Error Logging', () => {
    it('should log error objects with stack traces', async () => {
      const { logger, configureLogger } = await import('../../src/utils/logger.js');
      configureLogger({ level: 'error', prettyPrint: false });

      const error = new Error('Test error');
      logger.browser.error('Operation failed', { error });

      await new Promise(resolve => setTimeout(resolve, 50));

      const output = logOutput.join('');
      expect(output).toContain('Operation failed');
      expect(output).toContain('Test error');
    });
  });
});
