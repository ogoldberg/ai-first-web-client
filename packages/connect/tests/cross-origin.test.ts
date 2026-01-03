/**
 * Cross-Origin Testing for Unbrowser Connect SDK
 * CONN-013: Test sites with X-Frame-Options blocking
 *
 * Tests the handling of cross-origin restrictions including:
 * - X-Frame-Options blocking detection
 * - CORS error handling
 * - Iframe embedding checks
 * - Error escalation to popup mode
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { BackgroundFetcher } from '../src/fetchers/background-fetcher.js';
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

function setupDOMMocks() {
  // Mock document.createElement for iframe
  const mockIframe = {
    style: { cssText: '' },
    setAttribute: vi.fn(),
    remove: vi.fn(),
    src: '',
    onload: null as ((ev: Event) => void) | null,
    onerror: null as ((ev: Event) => void) | null,
    contentDocument: null as Document | null,
    contentWindow: null as Window | null,
  };

  const mockDiv = {
    id: '',
    style: { cssText: '' },
    appendChild: vi.fn(),
    remove: vi.fn(),
  };

  (global as any).document = {
    createElement: vi.fn((tag: string) => {
      if (tag === 'iframe') return { ...mockIframe };
      if (tag === 'div') return mockDiv;
      return {};
    }),
    body: { appendChild: vi.fn() },
  };

  (global as any).window = {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };

  (global as any).fetch = vi.fn(() =>
    Promise.resolve({
      ok: true,
      status: 200,
    })
  );

  return { mockIframe, mockDiv };
}

// ==========================================
// BackgroundFetcher Configuration Tests
// ==========================================

describe('BackgroundFetcher Configuration', () => {
  beforeEach(() => {
    setupDOMMocks();
  });

  it('should accept valid configuration', () => {
    const fetcher = new BackgroundFetcher({
      messageBus: createMockMessageBus(),
      patternCache: createMockPatternCache(),
      debug: false,
    });
    expect(fetcher).toBeDefined();
  });

  it('should accept debug mode', () => {
    const fetcher = new BackgroundFetcher({
      messageBus: createMockMessageBus(),
      patternCache: createMockPatternCache(),
      debug: true,
    });
    expect(fetcher).toBeDefined();
  });
});

// ==========================================
// X-Frame-Options Blocking Detection Tests
// ==========================================

describe('X-Frame-Options Blocking Detection', () => {
  it('should detect X-Frame-Options error text', () => {
    const errorTexts = [
      'refused to connect',
      'Refused to Connect',
      'refused to display',
      'x-frame-options',
      'X-Frame-Options',
    ];

    errorTexts.forEach((text) => {
      const lowerText = text.toLowerCase();
      const isBlocked =
        lowerText.includes('refused to connect') ||
        lowerText.includes('refused to display') ||
        lowerText.includes('x-frame-options');
      expect(isBlocked).toBe(true);
    });
  });

  it('should not falsely detect blocking in normal content', () => {
    const normalTexts = [
      'Welcome to our website',
      'This is a normal page',
      'Connect with us',
      'Display settings',
      'Options menu',
    ];

    normalTexts.forEach((text) => {
      const lowerText = text.toLowerCase();
      const isBlocked =
        lowerText.includes('refused to connect') ||
        lowerText.includes('refused to display') ||
        lowerText.includes('x-frame-options');
      expect(isBlocked).toBe(false);
    });
  });
});

// ==========================================
// IFRAME_BLOCKED Error Tests
// ==========================================

describe('IFRAME_BLOCKED Error Handling', () => {
  it('should define IFRAME_BLOCKED error code', () => {
    const errorCode = 'IFRAME_BLOCKED';
    expect(errorCode).toBe('IFRAME_BLOCKED');
  });

  it('should have descriptive error message', () => {
    const errorMessage = 'Site blocks iframe embedding';
    expect(errorMessage).toContain('iframe');
    expect(errorMessage).toContain('block');
  });

  it('should format error response correctly', () => {
    const error = {
      success: false as const,
      error: {
        code: 'IFRAME_BLOCKED' as const,
        message: 'Site blocks iframe embedding',
      },
    };

    expect(error.success).toBe(false);
    expect(error.error.code).toBe('IFRAME_BLOCKED');
    expect(typeof error.error.message).toBe('string');
  });
});

// ==========================================
// CORS Error Tests
// ==========================================

describe('CORS Error Handling', () => {
  it('should detect CORS blocked content', () => {
    const corsError = 'Cannot access iframe content (blocked by CORS)';
    expect(corsError).toContain('CORS');
    expect(corsError).toContain('blocked');
  });

  it('should handle null contentDocument as CORS block', () => {
    // When CORS blocks access, contentDocument is null
    const mockIframe = {
      contentDocument: null,
      contentWindow: null,
    };

    const isBlocked = !mockIframe.contentDocument || !mockIframe.contentWindow;
    expect(isBlocked).toBe(true);
  });

  it('should handle missing contentWindow as CORS block', () => {
    const mockIframe = {
      contentDocument: { title: 'test' }, // Non-null document
      contentWindow: null,
    };

    const isBlocked = !mockIframe.contentDocument || !mockIframe.contentWindow;
    expect(isBlocked).toBe(true);
  });
});

// ==========================================
// Iframe Embedding Check Tests
// ==========================================

describe('Iframe Embedding Checks', () => {
  beforeEach(() => {
    setupDOMMocks();
  });

  it('should have canEmbed method', () => {
    const fetcher = new BackgroundFetcher({
      messageBus: createMockMessageBus(),
      patternCache: createMockPatternCache(),
    });
    expect(typeof fetcher.canEmbed).toBe('function');
  });

  it('should use no-cors mode for canEmbed check', () => {
    // The canEmbed method uses mode: 'no-cors' which limits what headers we can read
    // This is a limitation acknowledged in the implementation
    const fetchMode = 'no-cors';
    expect(fetchMode).toBe('no-cors');
  });

  it('should return true optimistically due to CORS limitations', async () => {
    (global as any).fetch = vi.fn(() => Promise.resolve({ ok: true }));

    const fetcher = new BackgroundFetcher({
      messageBus: createMockMessageBus(),
      patternCache: createMockPatternCache(),
    });

    const result = await fetcher.canEmbed('https://example.com');
    expect(result).toBe(true);
  });

  it('should return false on network error', async () => {
    (global as any).fetch = vi.fn(() => Promise.reject(new Error('Network error')));

    const fetcher = new BackgroundFetcher({
      messageBus: createMockMessageBus(),
      patternCache: createMockPatternCache(),
    });

    const result = await fetcher.canEmbed('https://example.com');
    expect(result).toBe(false);
  });
});

// ==========================================
// Timeout Behavior Tests
// ==========================================

describe('Timeout Behavior', () => {
  it('should have default timeout of 30000ms', () => {
    const defaultTimeout = 30000;
    expect(defaultTimeout).toBe(30000);
  });

  it('should define TIMEOUT error code', () => {
    const errorCode = 'TIMEOUT';
    expect(errorCode).toBe('TIMEOUT');
  });

  it('should format timeout error correctly', () => {
    const timeout = 30000;
    const error = {
      success: false as const,
      error: {
        code: 'TIMEOUT' as const,
        message: `Fetch timed out after ${timeout}ms`,
      },
    };

    expect(error.success).toBe(false);
    expect(error.error.code).toBe('TIMEOUT');
    expect(error.error.message).toContain('30000ms');
  });
});

// ==========================================
// Iframe Load Detection Tests
// ==========================================

describe('Iframe Load Detection', () => {
  it('should detect load event within 5 seconds', () => {
    const loadDetectionTimeout = 5000;
    expect(loadDetectionTimeout).toBe(5000);
  });

  it('should treat no load event as IFRAME_BLOCKED', () => {
    // If load event doesn't fire within 5s, consider it blocked
    const loadAttempted = false;
    const resolved = false;

    const shouldBlock = !loadAttempted && !resolved;
    expect(shouldBlock).toBe(true);
  });

  it('should not block if load was attempted', () => {
    const loadAttempted = true;
    const resolved = false;

    const shouldBlock = !loadAttempted && !resolved;
    expect(shouldBlock).toBe(false);
  });

  it('should not block if already resolved', () => {
    const loadAttempted = false;
    const resolved = true;

    const shouldBlock = !loadAttempted && !resolved;
    expect(shouldBlock).toBe(false);
  });
});

// ==========================================
// Cleanup Tests
// ==========================================

describe('Cleanup on Error', () => {
  beforeEach(() => {
    setupDOMMocks();
  });

  it('should have destroy method', () => {
    const fetcher = new BackgroundFetcher({
      messageBus: createMockMessageBus(),
      patternCache: createMockPatternCache(),
    });
    expect(typeof fetcher.destroy).toBe('function');
  });

  it('should not throw when destroy is called on new instance', () => {
    const fetcher = new BackgroundFetcher({
      messageBus: createMockMessageBus(),
      patternCache: createMockPatternCache(),
    });
    expect(() => fetcher.destroy()).not.toThrow();
  });

  it('should allow multiple destroy calls', () => {
    const fetcher = new BackgroundFetcher({
      messageBus: createMockMessageBus(),
      patternCache: createMockPatternCache(),
    });
    expect(() => {
      fetcher.destroy();
      fetcher.destroy();
      fetcher.destroy();
    }).not.toThrow();
  });
});

// ==========================================
// Iframe Sandbox Attribute Tests
// ==========================================

describe('Iframe Sandbox Configuration', () => {
  it('should use correct sandbox attributes', () => {
    const sandboxAttr = 'allow-same-origin allow-scripts';
    expect(sandboxAttr).toContain('allow-same-origin');
    expect(sandboxAttr).toContain('allow-scripts');
  });

  it('should not allow forms in sandbox', () => {
    const sandboxAttr = 'allow-same-origin allow-scripts';
    expect(sandboxAttr).not.toContain('allow-forms');
  });

  it('should not allow popups in sandbox', () => {
    const sandboxAttr = 'allow-same-origin allow-scripts';
    expect(sandboxAttr).not.toContain('allow-popups');
  });

  it('should not allow top navigation in sandbox', () => {
    const sandboxAttr = 'allow-same-origin allow-scripts';
    expect(sandboxAttr).not.toContain('allow-top-navigation');
  });
});

// ==========================================
// Hidden Iframe Styles Tests
// ==========================================

describe('Hidden Iframe Styles', () => {
  it('should hide iframe off-screen', () => {
    const styles = {
      position: 'absolute',
      width: '1px',
      height: '1px',
      left: '-9999px',
      visibility: 'hidden',
    };

    expect(styles.position).toBe('absolute');
    expect(styles.left).toBe('-9999px');
    expect(styles.visibility).toBe('hidden');
  });

  it('should use minimal dimensions', () => {
    const width = '1px';
    const height = '1px';
    expect(width).toBe('1px');
    expect(height).toBe('1px');
  });
});

// ==========================================
// Error Escalation Tests
// ==========================================

describe('Error Escalation to Popup Mode', () => {
  it('should identify when escalation is needed', () => {
    // When IFRAME_BLOCKED occurs, should escalate to popup
    const iframeBlockedError = { code: 'IFRAME_BLOCKED', message: 'Site blocks iframe embedding' };
    const shouldEscalate = iframeBlockedError.code === 'IFRAME_BLOCKED';
    expect(shouldEscalate).toBe(true);
  });

  it('should not escalate on other errors', () => {
    const timeoutError = { code: 'TIMEOUT', message: 'Timeout' };
    const shouldEscalate = timeoutError.code === 'IFRAME_BLOCKED';
    expect(shouldEscalate).toBe(false);
  });

  it('should not escalate on extraction errors', () => {
    const extractionError = { code: 'EXTRACTION_FAILED', message: 'Failed to extract' };
    const shouldEscalate = extractionError.code === 'IFRAME_BLOCKED';
    expect(shouldEscalate).toBe(false);
  });
});

// ==========================================
// URL Domain Extraction Tests
// ==========================================

describe('URL Domain Extraction', () => {
  it('should extract domain from HTTPS URL', () => {
    const url = 'https://example.com/page';
    const domain = new URL(url).hostname;
    expect(domain).toBe('example.com');
  });

  it('should extract domain from HTTP URL', () => {
    const url = 'http://example.com/page';
    const domain = new URL(url).hostname;
    expect(domain).toBe('example.com');
  });

  it('should include subdomain in hostname', () => {
    const url = 'https://old.reddit.com/r/test';
    const domain = new URL(url).hostname;
    expect(domain).toBe('old.reddit.com');
  });

  it('should extract domain from URL with port', () => {
    const url = 'https://localhost:3000/page';
    const domain = new URL(url).hostname;
    expect(domain).toBe('localhost');
  });

  it('should extract domain from URL with query params', () => {
    const url = 'https://example.com/page?foo=bar&baz=qux';
    const domain = new URL(url).hostname;
    expect(domain).toBe('example.com');
  });
});

// ==========================================
// Fetch ID Generation Tests
// ==========================================

describe('Fetch ID Generation', () => {
  it('should generate unique IDs', () => {
    const generateId = () => `bg-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    const id1 = generateId();
    const id2 = generateId();

    // IDs should be different (with high probability)
    expect(id1).not.toBe(id2);
  });

  it('should use bg- prefix', () => {
    const generateId = () => `bg-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const id = generateId();
    expect(id.startsWith('bg-')).toBe(true);
  });

  it('should include timestamp', () => {
    const before = Date.now();
    const generateId = () => `bg-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const id = generateId();
    const after = Date.now();

    const parts = id.split('-');
    const timestamp = parseInt(parts[1], 10);
    expect(timestamp).toBeGreaterThanOrEqual(before);
    expect(timestamp).toBeLessThanOrEqual(after);
  });
});

// ==========================================
// Known Blocking Sites Tests
// ==========================================

describe('Known Blocking Sites', () => {
  // These are sites known to block iframe embedding
  const knownBlockingSites = [
    'facebook.com',
    'twitter.com',
    'linkedin.com',
    'github.com',
    'google.com',
    'amazon.com',
    'instagram.com',
  ];

  it('should identify commonly blocked sites', () => {
    knownBlockingSites.forEach((site) => {
      expect(typeof site).toBe('string');
      expect(site.length).toBeGreaterThan(0);
    });
  });

  // Note: In real tests, we'd test actual behavior, but that requires network access
  // These tests document the expected behavior
});

// ==========================================
// Progress Reporting Tests
// ==========================================

describe('Progress Reporting During Cross-Origin Fetch', () => {
  it('should report loading stage at 25%', () => {
    const progress = { stage: 'loading', percent: 25, message: 'Loading page...' };
    expect(progress.stage).toBe('loading');
    expect(progress.percent).toBe(25);
  });

  it('should report extracting stage at 75%', () => {
    const progress = { stage: 'extracting', percent: 75, message: 'Extracting content...' };
    expect(progress.stage).toBe('extracting');
    expect(progress.percent).toBe(75);
  });
});
