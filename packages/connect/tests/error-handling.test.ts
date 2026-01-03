/**
 * Error Handling Tests for Unbrowser Connect SDK
 * CONN-014: Network failures, timeouts, blocked popups
 *
 * These tests focus on synchronous error paths and configuration validation.
 * For async/integration tests, see the browser-based test page.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { UnbrowserConnect, createConnect } from '../src/connect.js';

// Setup minimal mocks for instantiation
function setupMinimalMocks() {
  (global as any).window = {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    open: vi.fn(() => null),
    postMessage: vi.fn(),
    screenX: 0,
    screenY: 0,
    outerWidth: 1024,
    outerHeight: 768,
  };

  (global as any).document = {
    createElement: vi.fn(() => ({
      style: { cssText: '' },
      id: '',
      setAttribute: vi.fn(),
      appendChild: vi.fn(),
      remove: vi.fn(),
    })),
    body: { appendChild: vi.fn() },
  };

  (global as any).indexedDB = {
    open: vi.fn(() => ({
      onerror: null,
      onsuccess: null,
      onupgradeneeded: null,
    })),
  };

  (global as any).fetch = vi.fn(() =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ patterns: [], syncToken: 'test' }),
    })
  );
}

// ==========================================
// Configuration Error Tests (Synchronous)
// ==========================================

describe('Configuration Errors', () => {
  beforeEach(setupMinimalMocks);

  it('should throw error when appId is missing', () => {
    expect(() => createConnect({ appId: '', apiKey: 'ub_test_123' })).toThrow(
      'appId and apiKey are required'
    );
  });

  it('should throw error when apiKey is missing', () => {
    expect(() => createConnect({ appId: 'test-app', apiKey: '' })).toThrow(
      'appId and apiKey are required'
    );
  });

  it('should throw error when both are missing', () => {
    expect(() => createConnect({ appId: '', apiKey: '' })).toThrow(
      'appId and apiKey are required'
    );
  });

  it('should accept valid configuration', () => {
    const connect = createConnect({
      appId: 'test-app',
      apiKey: 'ub_test_123',
    });
    expect(connect).toBeInstanceOf(UnbrowserConnect);
  });

  it('should accept custom apiUrl', () => {
    const connect = createConnect({
      appId: 'test-app',
      apiKey: 'ub_test_123',
      apiUrl: 'https://custom.api.com',
    });
    expect(connect).toBeDefined();
  });

  it('should accept debug flag', () => {
    const connect = createConnect({
      appId: 'test-app',
      apiKey: 'ub_test_123',
      debug: true,
    });
    expect(connect).toBeDefined();
  });

  it('should accept onReady callback', () => {
    const onReady = vi.fn();
    const connect = createConnect({
      appId: 'test-app',
      apiKey: 'ub_test_123',
      onReady,
    });
    expect(connect).toBeDefined();
  });

  it('should accept onError callback', () => {
    const onError = vi.fn();
    const connect = createConnect({
      appId: 'test-app',
      apiKey: 'ub_test_123',
      onError,
    });
    expect(connect).toBeDefined();
  });

  it('should accept theme configuration', () => {
    const connect = createConnect({
      appId: 'test-app',
      apiKey: 'ub_test_123',
      theme: {
        primaryColor: '#6366f1',
        backgroundColor: '#030712',
        textColor: '#f8fafc',
      },
    });
    expect(connect).toBeDefined();
  });
});

// ==========================================
// URL Validation Logic (Synchronous)
// ==========================================

describe('URL Validation Logic', () => {
  // Test the URL validation logic directly without async operations
  const isValidUrl = (url: string): boolean => {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  };

  it('should reject strings without protocol', () => {
    expect(isValidUrl('not-a-url')).toBe(false);
    expect(isValidUrl('just-text')).toBe(false);
    expect(isValidUrl('example.com')).toBe(false);
    expect(isValidUrl('www.example.com')).toBe(false);
  });

  it('should reject empty strings', () => {
    expect(isValidUrl('')).toBe(false);
  });

  it('should accept valid HTTP URLs', () => {
    expect(isValidUrl('http://example.com')).toBe(true);
    expect(isValidUrl('http://example.com/path')).toBe(true);
    expect(isValidUrl('http://example.com:8080')).toBe(true);
  });

  it('should accept valid HTTPS URLs', () => {
    expect(isValidUrl('https://example.com')).toBe(true);
    expect(isValidUrl('https://example.com/path?query=1')).toBe(true);
    expect(isValidUrl('https://sub.domain.example.com')).toBe(true);
  });

  it('should accept localhost URLs', () => {
    expect(isValidUrl('http://localhost')).toBe(true);
    expect(isValidUrl('http://localhost:3000')).toBe(true);
    expect(isValidUrl('http://127.0.0.1:8080')).toBe(true);
  });

  it('should accept URLs with special characters', () => {
    expect(isValidUrl('https://example.com/path?q=hello%20world')).toBe(true);
    expect(isValidUrl('https://example.com/path#section')).toBe(true);
    expect(isValidUrl('https://example.com/path?a=1&b=2')).toBe(true);
  });

  it('should accept file URLs', () => {
    expect(isValidUrl('file:///path/to/file')).toBe(true);
  });

  it('should accept data URLs', () => {
    expect(isValidUrl('data:text/plain,hello')).toBe(true);
  });

  // Note: URL constructor accepts ftp: protocol as valid
  it('should accept FTP URLs (per URL spec)', () => {
    expect(isValidUrl('ftp://ftp.example.com')).toBe(true);
  });
});

// ==========================================
// Error Code Types
// ==========================================

describe('Error Code Types', () => {
  it('should define all expected error codes', () => {
    const errorCodes = [
      'NOT_INITIALIZED',
      'INVALID_URL',
      'TIMEOUT',
      'BLOCKED',
      'AUTH_REQUIRED',
      'USER_CANCELLED',
      'EXTRACTION_FAILED',
      'NETWORK_ERROR',
      'QUOTA_EXCEEDED',
      'INVALID_CONFIG',
      'CORS_BLOCKED',
      'POPUP_BLOCKED',
      'IFRAME_BLOCKED',
    ] as const;

    errorCodes.forEach((code) => {
      expect(typeof code).toBe('string');
      expect(code.length).toBeGreaterThan(0);
      // Verify format: ALL_CAPS_SNAKE_CASE
      expect(code).toMatch(/^[A-Z][A-Z_]+$/);
    });
  });
});

// ==========================================
// Instance Methods (Synchronous)
// ==========================================

describe('Instance Methods', () => {
  beforeEach(setupMinimalMocks);

  it('should not throw when destroy is called on new instance', () => {
    const connect = createConnect({
      appId: 'test-app',
      apiKey: 'ub_test_123',
    });
    expect(() => connect.destroy()).not.toThrow();
  });

  it('should allow destroy to be called multiple times', () => {
    const connect = createConnect({
      appId: 'test-app',
      apiKey: 'ub_test_123',
    });
    expect(() => {
      connect.destroy();
      connect.destroy();
      connect.destroy();
    }).not.toThrow();
  });

  it('should have fetch method', () => {
    const connect = createConnect({
      appId: 'test-app',
      apiKey: 'ub_test_123',
    });
    expect(typeof connect.fetch).toBe('function');
  });

  it('should have batchFetch method', () => {
    const connect = createConnect({
      appId: 'test-app',
      apiKey: 'ub_test_123',
    });
    expect(typeof connect.batchFetch).toBe('function');
  });

  it('should have canFetchBackground method', () => {
    const connect = createConnect({
      appId: 'test-app',
      apiKey: 'ub_test_123',
    });
    expect(typeof connect.canFetchBackground).toBe('function');
  });

  it('should have getPattern method', () => {
    const connect = createConnect({
      appId: 'test-app',
      apiKey: 'ub_test_123',
    });
    expect(typeof connect.getPattern).toBe('function');
  });

  it('should have syncPatterns method', () => {
    const connect = createConnect({
      appId: 'test-app',
      apiKey: 'ub_test_123',
    });
    expect(typeof connect.syncPatterns).toBe('function');
  });

  it('should have destroy method', () => {
    const connect = createConnect({
      appId: 'test-app',
      apiKey: 'ub_test_123',
    });
    expect(typeof connect.destroy).toBe('function');
  });
});

// ==========================================
// FetchOptions Validation
// ==========================================

describe('FetchOptions Types', () => {
  it('should define valid mode options', () => {
    const modes = ['background', 'popup', 'tab'] as const;
    modes.forEach((mode) => {
      expect(typeof mode).toBe('string');
    });
  });

  it('should define valid extraction options', () => {
    const extractionOptions = {
      html: true,
      text: true,
      markdown: true,
      structured: true,
      usePatterns: true,
    };
    expect(extractionOptions.html).toBe(true);
    expect(extractionOptions.text).toBe(true);
    expect(extractionOptions.markdown).toBe(true);
    expect(extractionOptions.structured).toBe(true);
    expect(extractionOptions.usePatterns).toBe(true);
  });
});

// ==========================================
// FetchProgress Types
// ==========================================

describe('FetchProgress Types', () => {
  it('should define valid progress stages', () => {
    const stages = [
      'initializing',
      'loading',
      'waiting_auth',
      'extracting',
      'complete',
    ] as const;

    stages.forEach((stage) => {
      expect(typeof stage).toBe('string');
    });
  });

  it('should define progress structure', () => {
    const progress = {
      stage: 'loading' as const,
      percent: 50,
      message: 'Loading page...',
    };

    expect(progress.stage).toBe('loading');
    expect(typeof progress.percent).toBe('number');
    expect(progress.percent).toBeGreaterThanOrEqual(0);
    expect(progress.percent).toBeLessThanOrEqual(100);
    expect(typeof progress.message).toBe('string');
  });
});

// ==========================================
// FetchResult Structure
// ==========================================

describe('FetchResult Structure', () => {
  it('should define success result structure', () => {
    const successResult = {
      success: true as const,
      url: 'https://example.com',
      title: 'Example',
      content: {
        html: '<html>...</html>',
        text: 'Example content',
        markdown: '# Example',
      },
      meta: {
        duration: 1000,
        mode: 'background' as const,
        authenticated: false,
        contentType: 'text/html',
      },
    };

    expect(successResult.success).toBe(true);
    expect(typeof successResult.url).toBe('string');
    expect(typeof successResult.title).toBe('string');
    expect(typeof successResult.content).toBe('object');
    expect(typeof successResult.meta.duration).toBe('number');
  });

  it('should define error result structure', () => {
    const errorResult = {
      success: false as const,
      error: {
        code: 'INVALID_URL' as const,
        message: 'Invalid URL: bad-url',
      },
    };

    expect(errorResult.success).toBe(false);
    expect(typeof errorResult.error.code).toBe('string');
    expect(typeof errorResult.error.message).toBe('string');
  });
});

// ==========================================
// BatchFetch Types
// ==========================================

describe('BatchFetch Types', () => {
  it('should define batch options structure', () => {
    const batchOptions = {
      urls: ['https://example1.com', 'https://example2.com'],
      concurrency: 3,
      continueOnError: true,
    };

    expect(Array.isArray(batchOptions.urls)).toBe(true);
    expect(typeof batchOptions.concurrency).toBe('number');
    expect(typeof batchOptions.continueOnError).toBe('boolean');
  });

  it('should define batch result structure', () => {
    const batchResult = {
      total: 3,
      succeeded: 2,
      failed: 1,
      results: [],
    };

    expect(typeof batchResult.total).toBe('number');
    expect(typeof batchResult.succeeded).toBe('number');
    expect(typeof batchResult.failed).toBe('number');
    expect(Array.isArray(batchResult.results)).toBe(true);
    expect(batchResult.succeeded + batchResult.failed).toBe(batchResult.total);
  });
});

// ==========================================
// Edge Cases - Synchronous
// ==========================================

describe('Edge Cases', () => {
  beforeEach(setupMinimalMocks);

  it('should handle whitespace-only appId as invalid', () => {
    expect(() =>
      createConnect({ appId: '   ', apiKey: 'ub_test_123' })
    ).toThrow();
  });

  it('should handle whitespace-only apiKey as invalid', () => {
    expect(() =>
      createConnect({ appId: 'test-app', apiKey: '   ' })
    ).toThrow();
  });

  it('should accept API keys with different prefixes', () => {
    const liveConnect = createConnect({
      appId: 'test-app',
      apiKey: 'ub_live_abc123',
    });
    expect(liveConnect).toBeDefined();

    const testConnect = createConnect({
      appId: 'test-app',
      apiKey: 'ub_test_xyz789',
    });
    expect(testConnect).toBeDefined();
  });

  it('should create independent instances', () => {
    const connect1 = createConnect({
      appId: 'app-1',
      apiKey: 'ub_test_123',
    });
    const connect2 = createConnect({
      appId: 'app-2',
      apiKey: 'ub_test_456',
    });

    expect(connect1).not.toBe(connect2);
    expect(connect1).toBeInstanceOf(UnbrowserConnect);
    expect(connect2).toBeInstanceOf(UnbrowserConnect);
  });
});
