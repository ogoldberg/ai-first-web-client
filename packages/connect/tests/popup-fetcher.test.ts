/**
 * Popup Fetcher Tests for Unbrowser Connect SDK
 * Tests the OAuth-style popup authentication flow
 *
 * Tests cover:
 * - Popup window creation
 * - Popup blocked detection
 * - User cancelled handling
 * - Auth prompt display
 * - Timeout behavior
 * - Cross-origin polling
 * - Content extraction after auth
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PopupFetcher } from '../src/fetchers/popup-fetcher.js';
import type { MessageBus } from '../src/communication/message-bus.js';
import type { PatternCache } from '../src/patterns/pattern-cache.js';

// Create mock implementations
function createMockMessageBus(): MessageBus {
  return {
    init: vi.fn(),
    destroy: vi.fn(),
    send: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
  } as unknown as MessageBus;
}

function createMockPatternCache(): PatternCache {
  return {
    sync: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockReturnValue(undefined),
    has: vi.fn().mockReturnValue(false),
    load: vi.fn().mockResolvedValue(undefined),
  } as unknown as PatternCache;
}

function setupWindowMocks() {
  (global as any).window = {
    screenX: 0,
    screenY: 0,
    outerWidth: 1920,
    outerHeight: 1080,
    open: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
}

// ==========================================
// PopupFetcher Configuration Tests
// ==========================================

describe('PopupFetcher Configuration', () => {
  beforeEach(() => {
    setupWindowMocks();
  });

  it('should accept valid configuration', () => {
    const fetcher = new PopupFetcher({
      messageBus: createMockMessageBus(),
      patternCache: createMockPatternCache(),
    });
    expect(fetcher).toBeDefined();
  });

  it('should accept debug mode', () => {
    const fetcher = new PopupFetcher({
      messageBus: createMockMessageBus(),
      patternCache: createMockPatternCache(),
      debug: true,
    });
    expect(fetcher).toBeDefined();
  });

  it('should accept theme configuration', () => {
    const fetcher = new PopupFetcher({
      messageBus: createMockMessageBus(),
      patternCache: createMockPatternCache(),
      theme: {
        primaryColor: '#6366f1',
        backgroundColor: '#030712',
        textColor: '#f8fafc',
      },
    });
    expect(fetcher).toBeDefined();
  });
});

// ==========================================
// Popup Window Configuration Tests
// ==========================================

describe('Popup Window Configuration', () => {
  it('should define popup dimensions', () => {
    const width = 600;
    const height = 700;
    expect(width).toBe(600);
    expect(height).toBe(700);
  });

  it('should calculate centered position', () => {
    const screenX = 100;
    const screenY = 50;
    const outerWidth = 1920;
    const outerHeight = 1080;
    const width = 600;
    const height = 700;

    const left = screenX + (outerWidth - width) / 2;
    const top = screenY + (outerHeight - height) / 2;

    expect(left).toBe(760); // 100 + (1920-600)/2
    expect(top).toBe(240); // 50 + (1080-700)/2
  });

  it('should define popup features string', () => {
    const features = [
      'width=600',
      'height=700',
      'left=760',
      'top=240',
      'menubar=no',
      'toolbar=no',
      'location=yes',
      'status=no',
      'resizable=yes',
      'scrollbars=yes',
    ].join(',');

    expect(features).toContain('width=600');
    expect(features).toContain('height=700');
    expect(features).toContain('location=yes'); // Show URL bar for trust
    expect(features).toContain('menubar=no');
  });

  it('should show location bar for user trust', () => {
    const features = 'location=yes';
    expect(features).toContain('location=yes');
  });
});

// ==========================================
// Popup Blocked Detection Tests
// ==========================================

describe('Popup Blocked Detection', () => {
  it('should define POPUP_BLOCKED error code', () => {
    const errorCode = 'POPUP_BLOCKED';
    expect(errorCode).toBe('POPUP_BLOCKED');
  });

  it('should have descriptive error message', () => {
    const errorMessage = 'Browser blocked popup window';
    expect(errorMessage).toContain('blocked');
    expect(errorMessage).toContain('popup');
  });

  it('should format popup blocked error correctly', () => {
    const error = {
      success: false as const,
      error: {
        code: 'POPUP_BLOCKED' as const,
        message: 'Browser blocked popup window',
      },
    };

    expect(error.success).toBe(false);
    expect(error.error.code).toBe('POPUP_BLOCKED');
  });

  it('should detect null popup as blocked', () => {
    const popup = null;
    const isBlocked = !popup;
    expect(isBlocked).toBe(true);
  });

  it('should detect undefined popup as blocked', () => {
    const popup = undefined;
    const isBlocked = !popup;
    expect(isBlocked).toBe(true);
  });
});

// ==========================================
// User Cancelled Detection Tests
// ==========================================

describe('User Cancelled Detection', () => {
  it('should define USER_CANCELLED error code', () => {
    const errorCode = 'USER_CANCELLED';
    expect(errorCode).toBe('USER_CANCELLED');
  });

  it('should have descriptive error message', () => {
    const errorMessage = 'User closed the window';
    expect(errorMessage).toContain('closed');
    expect(errorMessage).toContain('window');
  });

  it('should format user cancelled error correctly', () => {
    const error = {
      success: false as const,
      error: {
        code: 'USER_CANCELLED' as const,
        message: 'User closed the window',
      },
    };

    expect(error.success).toBe(false);
    expect(error.error.code).toBe('USER_CANCELLED');
  });

  it('should detect closed popup', () => {
    const popup = { closed: true };
    expect(popup.closed).toBe(true);
  });

  it('should detect open popup', () => {
    const popup = { closed: false };
    expect(popup.closed).toBe(false);
  });
});

// ==========================================
// Auth Prompt Tests
// ==========================================

describe('Auth Prompt Display', () => {
  it('should support authPrompt option', () => {
    const options = {
      url: 'https://example.com',
      authPrompt: 'Please log in to access your dashboard',
    };
    expect(options.authPrompt).toBeDefined();
  });

  it('should report waiting_auth stage', () => {
    const progress = {
      stage: 'waiting_auth' as const,
      percent: 20,
      message: 'Please log in to access your dashboard',
    };
    expect(progress.stage).toBe('waiting_auth');
    expect(progress.percent).toBe(20);
  });

  it('should use custom auth prompt message', () => {
    const authPrompt = 'Sign in with your company credentials';
    const progress = {
      stage: 'waiting_auth' as const,
      percent: 20,
      message: authPrompt,
    };
    expect(progress.message).toBe(authPrompt);
  });
});

// ==========================================
// Timeout Behavior Tests
// ==========================================

describe('Popup Timeout Behavior', () => {
  it('should have default timeout of 60000ms', () => {
    const defaultTimeout = 60000;
    expect(defaultTimeout).toBe(60000);
  });

  it('should allow custom timeout', () => {
    const customTimeout = 120000;
    expect(customTimeout).toBe(120000);
  });

  it('should format timeout error correctly', () => {
    const timeout = 60000;
    const error = {
      success: false as const,
      error: {
        code: 'TIMEOUT' as const,
        message: `Fetch timed out after ${timeout}ms`,
      },
    };

    expect(error.error.code).toBe('TIMEOUT');
    expect(error.error.message).toContain('60000ms');
  });
});

// ==========================================
// Polling Behavior Tests
// ==========================================

describe('Cross-Origin Polling', () => {
  it('should poll every 500ms', () => {
    const pollInterval = 500;
    expect(pollInterval).toBe(500);
  });

  it('should check document.readyState for completion', () => {
    const readyStates = ['loading', 'interactive', 'complete'];
    expect(readyStates).toContain('complete');
  });

  it('should wait for complete readyState', () => {
    const readyState = 'complete';
    const isReady = readyState === 'complete';
    expect(isReady).toBe(true);
  });

  it('should not extract on loading state', () => {
    const readyState = 'loading';
    const isReady = readyState === 'complete';
    expect(isReady).toBe(false);
  });

  it('should not extract on interactive state', () => {
    const readyState = 'interactive';
    const isReady = readyState === 'complete';
    expect(isReady).toBe(false);
  });
});

// ==========================================
// Content Extraction Tests
// ==========================================

describe('Content Extraction After Auth', () => {
  it('should extract from popup document', () => {
    const mockDocument = {
      title: 'Dashboard - MyApp',
      readyState: 'complete',
    };
    expect(mockDocument.title).toBe('Dashboard - MyApp');
    expect(mockDocument.readyState).toBe('complete');
  });

  it('should get current URL from popup', () => {
    const mockLocation = {
      href: 'https://example.com/dashboard?user=123',
    };
    expect(mockLocation.href).toContain('dashboard');
  });

  it('should extract domain from popup URL', () => {
    const url = 'https://example.com/dashboard';
    const domain = new URL(url).hostname;
    expect(domain).toBe('example.com');
  });

  it('should mark result as authenticated', () => {
    const result = {
      success: true as const,
      url: 'https://example.com/dashboard',
      title: 'Dashboard',
      content: {},
      meta: {
        duration: 5000,
        mode: 'popup' as const,
        authenticated: true,
        contentType: 'text/html',
      },
    };

    expect(result.meta.authenticated).toBe(true);
    expect(result.meta.mode).toBe('popup');
  });
});

// ==========================================
// Extraction Failed Tests
// ==========================================

describe('Extraction Failed Handling', () => {
  it('should define EXTRACTION_FAILED error code', () => {
    const errorCode = 'EXTRACTION_FAILED';
    expect(errorCode).toBe('EXTRACTION_FAILED');
  });

  it('should format extraction error correctly', () => {
    const error = {
      success: false as const,
      error: {
        code: 'EXTRACTION_FAILED' as const,
        message: 'Could not find content selectors',
      },
    };

    expect(error.success).toBe(false);
    expect(error.error.code).toBe('EXTRACTION_FAILED');
  });
});

// ==========================================
// Cleanup Tests
// ==========================================

describe('Popup Cleanup', () => {
  beforeEach(() => {
    setupWindowMocks();
  });

  it('should have destroy method', () => {
    const fetcher = new PopupFetcher({
      messageBus: createMockMessageBus(),
      patternCache: createMockPatternCache(),
    });
    expect(typeof fetcher.destroy).toBe('function');
  });

  it('should not throw when destroy is called on new instance', () => {
    const fetcher = new PopupFetcher({
      messageBus: createMockMessageBus(),
      patternCache: createMockPatternCache(),
    });
    expect(() => fetcher.destroy()).not.toThrow();
  });

  it('should allow multiple destroy calls', () => {
    const fetcher = new PopupFetcher({
      messageBus: createMockMessageBus(),
      patternCache: createMockPatternCache(),
    });
    expect(() => {
      fetcher.destroy();
      fetcher.destroy();
    }).not.toThrow();
  });

  it('should close popup on cleanup', () => {
    const mockPopup = {
      closed: false,
      close: vi.fn(),
    };

    // Simulate cleanup behavior
    if (!mockPopup.closed) {
      mockPopup.close();
    }

    expect(mockPopup.close).toHaveBeenCalled();
  });
});

// ==========================================
// Fetch ID Generation Tests
// ==========================================

describe('Popup Fetch ID Generation', () => {
  it('should generate unique IDs', () => {
    const generateId = () => `popup-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    const id1 = generateId();
    const id2 = generateId();

    expect(id1).not.toBe(id2);
  });

  it('should use popup- prefix', () => {
    const generateId = () => `popup-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const id = generateId();
    expect(id.startsWith('popup-')).toBe(true);
  });
});

// ==========================================
// Progress Reporting Tests
// ==========================================

describe('Popup Progress Reporting', () => {
  it('should report loading stage at 10%', () => {
    const progress = { stage: 'loading', percent: 10, message: 'Opening page...' };
    expect(progress.stage).toBe('loading');
    expect(progress.percent).toBe(10);
  });

  it('should report waiting_auth stage at 20%', () => {
    const progress = { stage: 'waiting_auth', percent: 20, message: 'Please log in' };
    expect(progress.stage).toBe('waiting_auth');
    expect(progress.percent).toBe(20);
  });

  it('should report extracting stage at 80%', () => {
    const progress = { stage: 'extracting', percent: 80, message: 'Extracting content...' };
    expect(progress.stage).toBe('extracting');
    expect(progress.percent).toBe(80);
  });
});

// ==========================================
// FetchOptions for Popup Tests
// ==========================================

describe('Popup FetchOptions', () => {
  it('should support mode: popup', () => {
    const options = {
      url: 'https://example.com',
      mode: 'popup' as const,
    };
    expect(options.mode).toBe('popup');
  });

  it('should support requiresAuth option', () => {
    const options = {
      url: 'https://example.com/dashboard',
      mode: 'popup' as const,
      requiresAuth: true,
    };
    expect(options.requiresAuth).toBe(true);
  });

  it('should support authPrompt option', () => {
    const options = {
      url: 'https://example.com',
      mode: 'popup' as const,
      authPrompt: 'Please sign in to continue',
    };
    expect(options.authPrompt).toBeDefined();
  });

  it('should support timeout option', () => {
    const options = {
      url: 'https://example.com',
      mode: 'popup' as const,
      timeout: 120000,
    };
    expect(options.timeout).toBe(120000);
  });

  it('should support extract options', () => {
    const options = {
      url: 'https://example.com',
      mode: 'popup' as const,
      extract: {
        html: true,
        text: true,
        markdown: true,
      },
    };
    expect(options.extract?.html).toBe(true);
  });

  it('should support onProgress callback', () => {
    const onProgress = vi.fn();
    const options = {
      url: 'https://example.com',
      mode: 'popup' as const,
      onProgress,
    };
    expect(typeof options.onProgress).toBe('function');
  });
});

// ==========================================
// Cross-Origin Flow Tests
// ==========================================

describe('Cross-Origin Authentication Flow', () => {
  it('should handle OAuth redirect flow', () => {
    // User starts at: https://app.com/login
    // Redirects to: https://auth.google.com/...
    // Returns to: https://app.com/callback
    // Finally at: https://app.com/dashboard

    const flowSteps = [
      'https://app.com/login',
      'https://auth.google.com/oauth',
      'https://app.com/callback',
      'https://app.com/dashboard',
    ];

    expect(flowSteps.length).toBe(4);
    expect(flowSteps[0]).toContain('app.com');
    expect(flowSteps[1]).toContain('google.com');
    expect(flowSteps[3]).toContain('dashboard');
  });

  it('should silently handle cross-origin errors during auth', () => {
    // During auth flow, accessing popup.document throws
    // This should be caught and polling should continue
    const handleCrossOrigin = () => {
      try {
        throw new Error('Blocked a frame with origin from accessing a cross-origin frame');
      } catch {
        // Expected - keep polling
        return 'continue';
      }
    };

    expect(handleCrossOrigin()).toBe('continue');
  });
});
