/**
 * SDK Contract Tests
 *
 * These tests verify the public SDK interface contract.
 * They will fail if the SDK is moved/removed incorrectly during deduplication.
 *
 * Purpose: Detect breakage when moving SDK from packages/core to rabbit-found/unbrowser
 */

import { describe, it, expect } from 'vitest';

describe('SDK Contract Tests', () => {
  describe('packages/core exports', () => {
    it('should export createUnbrowser factory function', async () => {
      const module = await import('../../packages/core/src/index.js');
      expect(typeof module.createUnbrowser).toBe('function');
    });

    it('should export UnbrowserClient class', async () => {
      const module = await import('../../packages/core/src/index.js');
      expect(typeof module.UnbrowserClient).toBe('function');
    });

    it('should export UnbrowserError class', async () => {
      const module = await import('../../packages/core/src/index.js');
      expect(typeof module.UnbrowserError).toBe('function');
    });

    it('should export all required types', async () => {
      // This is a compile-time check - if the imports work, types exist
      const module = await import('../../packages/core/src/index.js');

      // Factory function exists
      expect(module.createUnbrowser).toBeDefined();

      // Classes exist
      expect(module.UnbrowserClient).toBeDefined();
      expect(module.UnbrowserError).toBeDefined();
    });
  });

  describe('SDK client construction', () => {
    it('should create client with valid API key', async () => {
      const { createUnbrowser } = await import('../../packages/core/src/index.js');

      const client = createUnbrowser({
        apiKey: 'ub_test_abcdefghijklmnopqrstuvwxyz123456',
      });

      expect(client).toBeDefined();
      expect(typeof client.browse).toBe('function');
      expect(typeof client.batch).toBe('function');
      expect(typeof client.fetch).toBe('function');
      expect(typeof client.getDomainIntelligence).toBe('function');
      expect(typeof client.getUsage).toBe('function');
      expect(typeof client.health).toBe('function');
    });

    it('should reject invalid API key format', async () => {
      const { createUnbrowser, UnbrowserError } = await import(
        '../../packages/core/src/index.js'
      );

      expect(() => createUnbrowser({ apiKey: 'invalid' })).toThrow(UnbrowserError);
    });

    it('should accept custom baseUrl', async () => {
      const { createUnbrowser } = await import('../../packages/core/src/index.js');

      const client = createUnbrowser({
        apiKey: 'ub_test_abcdefghijklmnopqrstuvwxyz123456',
        baseUrl: 'https://custom.api.example.com',
      });

      expect(client).toBeDefined();
    });
  });

  describe('Error class contract', () => {
    it('should have code property', async () => {
      const { UnbrowserError } = await import('../../packages/core/src/index.js');

      const error = new UnbrowserError('TEST_CODE', 'Test message');

      expect(error.code).toBe('TEST_CODE');
      expect(error.message).toBe('Test message');
      expect(error.name).toBe('UnbrowserError');
      expect(error instanceof Error).toBe(true);
    });
  });
});

describe('SDK File Existence', () => {
  it('should have http-client.ts', async () => {
    // This will fail if the file is missing
    const module = await import('../../packages/core/src/http-client.js');
    expect(module).toBeDefined();
  });

  it('should have errors.ts', async () => {
    const module = await import('../../packages/core/src/errors.js');
    expect(module).toBeDefined();
  });

  it('should have types.ts', async () => {
    const module = await import('../../packages/core/src/types.js');
    expect(module).toBeDefined();
  });

  it('should have index.ts re-exports', async () => {
    const module = await import('../../packages/core/src/index.js');

    // All these should be re-exported from index
    expect(module.createUnbrowser).toBeDefined();
    expect(module.UnbrowserClient).toBeDefined();
    expect(module.UnbrowserError).toBeDefined();
  });
});
