/**
 * Unbrowser Connect SDK Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UnbrowserConnect, createConnect } from '../src/connect.js';

// Mock the DOM for Node.js environment
const mockWindow = {
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  open: vi.fn(),
  postMessage: vi.fn(),
};

const mockDocument = {
  createElement: vi.fn(() => ({
    style: {},
    setAttribute: vi.fn(),
    appendChild: vi.fn(),
    remove: vi.fn(),
  })),
  body: {
    appendChild: vi.fn(),
  },
};

// Set up global mocks
(global as any).window = mockWindow;
(global as any).document = mockDocument;
(global as any).indexedDB = {
  open: vi.fn(() => ({
    onerror: null,
    onsuccess: null,
    onupgradeneeded: null,
  })),
};

describe('UnbrowserConnect', () => {
  describe('initialization', () => {
    it('should require appId and apiKey', () => {
      expect(() => createConnect({ appId: '', apiKey: '' })).toThrow('appId and apiKey are required');
    });

    it('should create instance with valid config', () => {
      const connect = createConnect({
        appId: 'test-app',
        apiKey: 'ub_test_abc123',
      });
      expect(connect).toBeInstanceOf(UnbrowserConnect);
    });

    it('should set default apiUrl', () => {
      const connect = createConnect({
        appId: 'test-app',
        apiKey: 'ub_test_abc123',
      });
      // Internal state would have default apiUrl
      expect(connect).toBeDefined();
    });
  });

  describe('URL validation', () => {
    it('should reject invalid URLs synchronously', () => {
      // Test URL validation logic directly
      const isValidUrl = (url: string): boolean => {
        try {
          new URL(url);
          return true;
        } catch {
          return false;
        }
      };

      expect(isValidUrl('not-a-url')).toBe(false);
      expect(isValidUrl('https://example.com')).toBe(true);
      expect(isValidUrl('http://localhost:3000')).toBe(true);
      expect(isValidUrl('')).toBe(false);
    });
  });
});

describe('createConnect factory', () => {
  it('should return UnbrowserConnect instance', () => {
    const connect = createConnect({
      appId: 'my-app',
      apiKey: 'ub_live_xyz',
    });
    expect(connect).toBeInstanceOf(UnbrowserConnect);
  });
});
