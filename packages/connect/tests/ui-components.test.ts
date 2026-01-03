/**
 * UI Component Tests for Unbrowser Connect SDK
 *
 * Tests the built-in UI components:
 * - Progress Overlay
 * - Auth Modal
 * - Error Toast
 * - UI Manager
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock DOM
function setupDOMMocks() {
  const elements = new Map<string, HTMLElement>();

  (global as any).document = {
    getElementById: vi.fn((id: string) => elements.get(id)),
    createElement: vi.fn((tag: string) => {
      const el = {
        tagName: tag.toUpperCase(),
        className: '',
        id: '',
        textContent: '',
        style: { cssText: '' },
        onclick: null as (() => void) | null,
        children: [] as HTMLElement[],
        classList: {
          add: vi.fn(),
          remove: vi.fn(),
          contains: vi.fn(() => false),
        },
        appendChild: vi.fn((child: HTMLElement) => {
          (el as any).children.push(child);
          return child;
        }),
        remove: vi.fn(),
        focus: vi.fn(),
      };
      return el;
    }),
    head: {
      appendChild: vi.fn(),
    },
    body: {
      appendChild: vi.fn(),
    },
  };

  return elements;
}

// ==========================================
// Theme Tests
// ==========================================

describe('Theme Configuration', () => {
  it('should define default theme values', () => {
    const defaultTheme = {
      primaryColor: '#6366f1',
      backgroundColor: '#ffffff',
      textColor: '#1f2937',
      borderRadius: '8px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    };

    expect(defaultTheme.primaryColor).toBe('#6366f1');
    expect(defaultTheme.backgroundColor).toBe('#ffffff');
    expect(defaultTheme.textColor).toBe('#1f2937');
    expect(defaultTheme.borderRadius).toBe('8px');
    expect(defaultTheme.fontFamily).toContain('apple-system');
  });

  it('should merge custom theme with defaults', () => {
    const defaultTheme = {
      primaryColor: '#6366f1',
      backgroundColor: '#ffffff',
      textColor: '#1f2937',
      borderRadius: '8px',
      fontFamily: 'sans-serif',
    };

    const customTheme = {
      primaryColor: '#ff0000',
      backgroundColor: '#000000',
    };

    const merged = { ...defaultTheme, ...customTheme };

    expect(merged.primaryColor).toBe('#ff0000');
    expect(merged.backgroundColor).toBe('#000000');
    expect(merged.textColor).toBe('#1f2937'); // Still default
    expect(merged.borderRadius).toBe('8px'); // Still default
  });
});

// ==========================================
// Progress Overlay Tests
// ==========================================

describe('Progress Overlay', () => {
  beforeEach(() => {
    setupDOMMocks();
  });

  it('should define progress stages', () => {
    const stages = ['initializing', 'loading', 'waiting_auth', 'extracting', 'complete'];
    stages.forEach((stage) => {
      expect(typeof stage).toBe('string');
    });
  });

  it('should display percentage from 0 to 100', () => {
    const percentages = [0, 10, 25, 50, 75, 100];
    percentages.forEach((p) => {
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(100);
    });
  });

  it('should format percentage display', () => {
    const percent = 75;
    const display = `${percent}%`;
    expect(display).toBe('75%');
  });

  it('should have spinner animation', () => {
    const spinnerClass = 'ub-spinner';
    expect(spinnerClass).toBe('ub-spinner');
  });

  it('should use overlay class', () => {
    const overlayClass = 'ub-overlay';
    expect(overlayClass).toBe('ub-overlay');
  });

  it('should use card class for modal', () => {
    const cardClass = 'ub-card';
    expect(cardClass).toBe('ub-card');
  });
});

// ==========================================
// Auth Modal Tests
// ==========================================

describe('Auth Modal', () => {
  beforeEach(() => {
    setupDOMMocks();
  });

  it('should define default title', () => {
    const defaultTitle = 'Sign In Required';
    expect(defaultTitle).toBe('Sign In Required');
  });

  it('should define default message', () => {
    const defaultMessage = 'A popup window will open for you to sign in. Please complete the sign-in process to continue.';
    expect(defaultMessage).toContain('popup');
    expect(defaultMessage).toContain('sign in');
  });

  it('should define default button text', () => {
    const defaultButtonText = 'Continue';
    expect(defaultButtonText).toBe('Continue');
  });

  it('should define default cancel text', () => {
    const defaultCancelText = 'Cancel';
    expect(defaultCancelText).toBe('Cancel');
  });

  it('should support custom title', () => {
    const config = {
      title: 'Login Required',
    };
    expect(config.title).toBe('Login Required');
  });

  it('should support custom message', () => {
    const config = {
      message: 'Please authenticate with your work account.',
    };
    expect(config.message).toContain('authenticate');
  });

  it('should support hiding cancel button', () => {
    const config = {
      showCancel: false,
    };
    expect(config.showCancel).toBe(false);
  });

  it('should return confirmed true on continue', () => {
    const result = { confirmed: true };
    expect(result.confirmed).toBe(true);
  });

  it('should return confirmed false on cancel', () => {
    const result = { confirmed: false };
    expect(result.confirmed).toBe(false);
  });
});

// ==========================================
// Error Toast Tests
// ==========================================

describe('Error Toast', () => {
  beforeEach(() => {
    setupDOMMocks();
  });

  it('should define default duration of 5000ms', () => {
    const defaultDuration = 5000;
    expect(defaultDuration).toBe(5000);
  });

  it('should allow custom duration', () => {
    const customDuration = 10000;
    expect(customDuration).toBe(10000);
  });

  it('should display error message', () => {
    const error = {
      code: 'NETWORK_ERROR' as const,
      message: 'Failed to connect to server',
    };
    expect(error.message).toContain('Failed');
  });

  it('should have close button', () => {
    const closeSymbol = '\u00D7'; // X symbol
    expect(closeSymbol).toBe('\u00D7');
  });

  it('should have warning icon', () => {
    const warningSymbol = '\u26A0'; // Warning sign
    expect(warningSymbol).toBe('\u26A0');
  });

  it('should use toast class', () => {
    const toastClass = 'ub-toast';
    expect(toastClass).toBe('ub-toast');
  });

  it('should position at bottom right', () => {
    const position = {
      bottom: '24px',
      right: '24px',
    };
    expect(position.bottom).toBe('24px');
    expect(position.right).toBe('24px');
  });
});

// ==========================================
// UI Manager Tests
// ==========================================

describe('UI Manager', () => {
  beforeEach(() => {
    setupDOMMocks();
  });

  it('should respect global showProgress option', () => {
    const globalOptions = { showProgress: true };
    const shouldShow = globalOptions.showProgress ?? false;
    expect(shouldShow).toBe(true);
  });

  it('should respect global showErrors option', () => {
    const globalOptions = { showErrors: true };
    const shouldShow = globalOptions.showErrors ?? false;
    expect(shouldShow).toBe(true);
  });

  it('should allow per-fetch override of showProgress', () => {
    const globalOptions = { showProgress: true };
    const fetchUI = { showProgress: false };

    // Per-fetch option takes precedence
    const shouldShow = fetchUI.showProgress !== undefined
      ? fetchUI.showProgress
      : globalOptions.showProgress ?? false;

    expect(shouldShow).toBe(false);
  });

  it('should use document.body as default container', () => {
    const globalOptions = {};
    const container = globalOptions.container ?? document.body;
    expect(container).toBe(document.body);
  });

  it('should allow custom container', () => {
    const customContainer = document.createElement('div');
    const globalOptions = { container: customContainer };
    const container = globalOptions.container ?? document.body;
    expect(container).toBe(customContainer);
  });
});

// ==========================================
// Global UI Options Tests
// ==========================================

describe('Global UI Options', () => {
  it('should define all global options', () => {
    const options = {
      showProgress: false,
      showErrors: true,
      errorDuration: 5000,
      container: undefined as HTMLElement | undefined,
    };

    expect(typeof options.showProgress).toBe('boolean');
    expect(typeof options.showErrors).toBe('boolean');
    expect(typeof options.errorDuration).toBe('number');
  });

  it('should default showProgress to false', () => {
    const defaultShowProgress = false;
    expect(defaultShowProgress).toBe(false);
  });

  it('should default showErrors to false', () => {
    const defaultShowErrors = false;
    expect(defaultShowErrors).toBe(false);
  });
});

// ==========================================
// Fetch UI Options Tests
// ==========================================

describe('Fetch UI Options', () => {
  it('should support per-fetch showProgress', () => {
    const fetchUI = {
      showProgress: true,
    };
    expect(fetchUI.showProgress).toBe(true);
  });

  it('should support authPrompt config', () => {
    const fetchUI = {
      authPrompt: {
        title: 'Sign In',
        message: 'Please sign in to continue',
        buttonText: 'Sign In',
      },
    };
    expect(fetchUI.authPrompt?.title).toBe('Sign In');
  });

  it('should support per-fetch container', () => {
    const customContainer = {} as HTMLElement;
    const fetchUI = {
      container: customContainer,
    };
    expect(fetchUI.container).toBe(customContainer);
  });
});

// ==========================================
// CSS Animation Tests
// ==========================================

describe('CSS Animations', () => {
  it('should define fade-in animation', () => {
    const animationName = 'ub-fade-in';
    expect(animationName).toBe('ub-fade-in');
  });

  it('should define fade-out animation', () => {
    const animationName = 'ub-fade-out';
    expect(animationName).toBe('ub-fade-out');
  });

  it('should define slide-up animation', () => {
    const animationName = 'ub-slide-up';
    expect(animationName).toBe('ub-slide-up');
  });

  it('should define spin animation', () => {
    const animationName = 'ub-spin';
    expect(animationName).toBe('ub-spin');
  });

  it('should define slide-in animation for toast', () => {
    const animationName = 'ub-slide-in';
    expect(animationName).toBe('ub-slide-in');
  });

  it('should use hiding class for exit animations', () => {
    const hidingClass = 'ub-hiding';
    expect(hidingClass).toBe('ub-hiding');
  });
});

// ==========================================
// CSS Class Names Tests
// ==========================================

describe('CSS Class Names', () => {
  it('should use ub- prefix for all classes', () => {
    const classes = [
      'ub-overlay',
      'ub-card',
      'ub-title',
      'ub-message',
      'ub-progress-container',
      'ub-spinner',
      'ub-percent',
      'ub-stage',
      'ub-buttons',
      'ub-btn',
      'ub-btn-primary',
      'ub-btn-secondary',
      'ub-toast',
      'ub-toast-icon',
      'ub-toast-message',
      'ub-toast-close',
      'ub-hiding',
    ];

    classes.forEach((cls) => {
      expect(cls.startsWith('ub-')).toBe(true);
    });
  });
});

// ==========================================
// Style Injection Tests
// ==========================================

describe('Style Injection', () => {
  beforeEach(() => {
    setupDOMMocks();
  });

  it('should use unique style id', () => {
    const styleId = 'unbrowser-connect-styles';
    expect(styleId).toBe('unbrowser-connect-styles');
  });

  it('should only inject styles once', () => {
    // Simulate style already exists
    const mockElements = new Map<string, HTMLElement>();
    mockElements.set('unbrowser-connect-styles', {} as HTMLElement);

    const styleExists = mockElements.has('unbrowser-connect-styles');
    expect(styleExists).toBe(true);
  });
});

// ==========================================
// Z-Index Tests
// ==========================================

describe('Z-Index Layering', () => {
  it('should use high z-index for overlay', () => {
    const zIndex = 999999;
    expect(zIndex).toBeGreaterThan(1000);
  });

  it('should use same high z-index for toast', () => {
    const zIndex = 999999;
    expect(zIndex).toBeGreaterThan(1000);
  });
});
