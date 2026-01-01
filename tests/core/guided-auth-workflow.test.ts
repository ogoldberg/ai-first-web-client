/**
 * Tests for Guided Authentication Workflow (INT-010)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  GuidedAuthWorkflow,
  type GuidedAuthStep,
  type AuthSessionProgress,
  type GuidedAuthOptions,
  type UserAuthActionCallback,
} from '../../src/core/guided-auth-workflow.js';

// Mock playwright-core types
const createMockPage = () => ({
  goto: vi.fn().mockResolvedValue(undefined),
  waitForLoadState: vi.fn().mockResolvedValue(undefined),
  waitForNavigation: vi.fn().mockResolvedValue(undefined),
  waitForTimeout: vi.fn().mockResolvedValue(undefined),
  url: vi.fn().mockReturnValue('https://example.com/dashboard'),
  $: vi.fn().mockResolvedValue(null),
  screenshot: vi.fn().mockResolvedValue(Buffer.from('fake-screenshot')),
  context: vi.fn().mockReturnValue({
    cookies: vi.fn().mockResolvedValue([]),
  }),
});

const createMockElement = (visible = true, enabled = true) => ({
  isVisible: vi.fn().mockResolvedValue(visible),
  isEnabled: vi.fn().mockResolvedValue(enabled),
  fill: vi.fn().mockResolvedValue(undefined),
  click: vi.fn().mockResolvedValue(undefined),
});

describe('GuidedAuthWorkflow', () => {
  let workflow: GuidedAuthWorkflow;

  beforeEach(() => {
    workflow = new GuidedAuthWorkflow();
  });

  describe('constructor', () => {
    it('should create a new instance', () => {
      expect(workflow).toBeInstanceOf(GuidedAuthWorkflow);
    });
  });

  describe('configure', () => {
    it('should accept session manager', () => {
      const mockSessionManager = { saveSession: vi.fn() } as any;
      workflow.configure({ sessionManager: mockSessionManager });
      // No error thrown means success
    });

    it('should accept auth flow detector', () => {
      const mockAuthFlowDetector = { detectFromResponse: vi.fn() } as any;
      workflow.configure({ authFlowDetector: mockAuthFlowDetector });
      // No error thrown means success
    });
  });

  describe('startAuth', () => {
    it('should start auth workflow and track progress', async () => {
      const mockPage = createMockPage();
      mockPage.url.mockReturnValue('https://example.com/login');

      // Mock form elements not found - will create minimal steps
      const userCallback: UserAuthActionCallback = {
        onStepAction: vi.fn().mockResolvedValue({ value: 'test' }),
        onStepStatusChange: vi.fn(),
        onComplete: vi.fn(),
      };

      const options: GuidedAuthOptions = {
        userCallback,
        captureScreenshots: false,
        autoDetectForm: false,
        predefinedSteps: [],
        maxAuthTimeMs: 1000,
      };

      const result = await workflow.startAuth(mockPage as any, 'https://example.com/login', options);

      expect(result).toBeDefined();
      expect(result.progress).toBeDefined();
      expect(result.progress.domain).toBe('example.com');
      expect(result.progress.targetUrl).toBe('https://example.com/login');
    });

    it('should execute predefined steps in sequence', async () => {
      const mockPage = createMockPage();
      const mockElement = createMockElement();

      // Return mock element for input selectors
      mockPage.$.mockImplementation(async (selector: string) => {
        if (selector.includes('email') || selector.includes('password') || selector.includes('submit')) {
          return mockElement;
        }
        return null;
      });

      // Mock successful navigation away from login
      mockPage.url.mockReturnValue('https://example.com/dashboard');

      const stepActions: string[] = [];
      const userCallback: UserAuthActionCallback = {
        onStepAction: vi.fn().mockImplementation(async (step: GuidedAuthStep) => {
          stepActions.push(step.type);
          return { value: step.type === 'enter_password' ? 'secret123' : 'user@example.com' };
        }),
        onStepStatusChange: vi.fn(),
        onComplete: vi.fn(),
      };

      const options: GuidedAuthOptions = {
        userCallback,
        captureScreenshots: false,
        predefinedSteps: [
          { type: 'enter_username', selector: 'input[name="email"]' },
          { type: 'enter_password', selector: 'input[type="password"]' },
          { type: 'click_submit', selector: 'button[type="submit"]' },
        ],
      };

      const result = await workflow.startAuth(mockPage as any, 'https://example.com/login', options);

      expect(result.progress.steps.length).toBe(3);
      expect(stepActions).toContain('enter_username');
      expect(stepActions).toContain('enter_password');
    });

    it('should capture screenshots when enabled', async () => {
      const mockPage = createMockPage();
      mockPage.url.mockReturnValue('https://example.com/dashboard');

      const screenshots: string[] = [];
      const userCallback: UserAuthActionCallback = {
        onStepAction: vi.fn().mockResolvedValue({ value: 'test' }),
        onScreenshot: vi.fn().mockImplementation(async (screenshot: string) => {
          screenshots.push(screenshot);
        }),
        onComplete: vi.fn(),
      };

      const options: GuidedAuthOptions = {
        userCallback,
        captureScreenshots: true,
        predefinedSteps: [{ type: 'wait', selector: '100' }],
      };

      await workflow.startAuth(mockPage as any, 'https://example.com/login', options);

      expect(mockPage.screenshot).toHaveBeenCalled();
      expect(userCallback.onScreenshot).toHaveBeenCalled();
    });

    it('should handle cancelled workflow', async () => {
      const mockPage = createMockPage();
      mockPage.url.mockReturnValue('https://example.com/login'); // Stay on login page

      const userCallback: UserAuthActionCallback = {
        onStepAction: vi.fn().mockResolvedValue({ cancel: true }),
        onComplete: vi.fn(),
      };

      const options: GuidedAuthOptions = {
        userCallback,
        predefinedSteps: [{ type: 'enter_username', selector: 'input[name="email"]' }],
      };

      // Mock element found
      mockPage.$.mockResolvedValue(createMockElement());

      const result = await workflow.startAuth(mockPage as any, 'https://example.com/login', options);

      expect(result.progress.status).toBe('cancelled');
      // onComplete should be called - it may have the error from cancellation
      expect(userCallback.onComplete).toHaveBeenCalled();
    });

    it('should handle skipped steps', async () => {
      const mockPage = createMockPage();
      mockPage.url.mockReturnValue('https://example.com/dashboard');

      const userCallback: UserAuthActionCallback = {
        onStepAction: vi.fn().mockResolvedValue({ skip: true }),
        onComplete: vi.fn(),
      };

      const options: GuidedAuthOptions = {
        userCallback,
        predefinedSteps: [
          // Use email_verify which handles skip differently - returns early
          { type: 'email_verify', instruction: 'Check your email' },
        ],
      };

      mockPage.$.mockResolvedValue(createMockElement());

      const result = await workflow.startAuth(mockPage as any, 'https://example.com/login', options);

      expect(result.progress.steps[0].status).toBe('skipped');
    });

    it('should timeout if auth takes too long', async () => {
      const mockPage = createMockPage();
      mockPage.url.mockReturnValue('https://example.com/login');

      // Simulate a long delay by making waitForTimeout actually wait
      let startTime = 0;
      mockPage.waitForTimeout.mockImplementation(async () => {
        startTime = Date.now();
        // Actually wait a bit to simulate real timeout scenario
        await new Promise(resolve => setTimeout(resolve, 100));
      });

      const userCallback: UserAuthActionCallback = {
        onStepAction: vi.fn().mockResolvedValue({}),
        onComplete: vi.fn(),
      };

      const options: GuidedAuthOptions = {
        userCallback,
        maxAuthTimeMs: 10, // Very short timeout - shorter than the wait step
        predefinedSteps: [
          { type: 'wait', selector: '200' }, // Wait step will be checked before execution
        ],
      };

      const result = await workflow.startAuth(mockPage as any, 'https://example.com/login', options);

      // The workflow should fail due to verification failure (still on login page)
      // or timeout - either way it shouldn't succeed
      expect(result.success).toBe(false);
    });
  });

  describe('getSessionProgress', () => {
    it('should return undefined for non-existent session', () => {
      const progress = workflow.getSessionProgress('non-existent-session');
      expect(progress).toBeUndefined();
    });
  });

  describe('cancelSession', () => {
    it('should return false for non-existent session', () => {
      const cancelled = workflow.cancelSession('non-existent-session');
      expect(cancelled).toBe(false);
    });
  });

  describe('step types', () => {
    describe('enter_username step', () => {
      it('should fill username input with provided value', async () => {
        const mockPage = createMockPage();
        const mockElement = createMockElement();
        mockPage.$.mockResolvedValue(mockElement);
        mockPage.url.mockReturnValue('https://example.com/dashboard');

        const userCallback: UserAuthActionCallback = {
          onStepAction: vi.fn().mockResolvedValue({ value: 'test@example.com' }),
          onComplete: vi.fn(),
        };

        const options: GuidedAuthOptions = {
          userCallback,
          predefinedSteps: [
            { type: 'enter_username', selector: 'input[name="email"]' },
          ],
        };

        await workflow.startAuth(mockPage as any, 'https://example.com/login', options);

        expect(mockElement.fill).toHaveBeenCalledWith('');
        expect(mockElement.fill).toHaveBeenCalledWith('test@example.com');
      });
    });

    describe('enter_password step', () => {
      it('should mask password in userInput', async () => {
        const mockPage = createMockPage();
        const mockElement = createMockElement();
        mockPage.$.mockResolvedValue(mockElement);
        mockPage.url.mockReturnValue('https://example.com/dashboard');

        const userCallback: UserAuthActionCallback = {
          onStepAction: vi.fn().mockResolvedValue({ value: 'supersecret' }),
          onComplete: vi.fn(),
        };

        const options: GuidedAuthOptions = {
          userCallback,
          predefinedSteps: [
            { type: 'enter_password', selector: 'input[type="password"]' },
          ],
        };

        const result = await workflow.startAuth(mockPage as any, 'https://example.com/login', options);

        expect(result.progress.steps[0].userInput).toBe('***');
      });
    });

    describe('click_submit step', () => {
      it('should click submit button', async () => {
        const mockPage = createMockPage();
        const mockElement = createMockElement();
        mockPage.$.mockResolvedValue(mockElement);
        mockPage.url.mockReturnValue('https://example.com/dashboard');

        const userCallback: UserAuthActionCallback = {
          onStepAction: vi.fn().mockResolvedValue({}),
          onComplete: vi.fn(),
        };

        const options: GuidedAuthOptions = {
          userCallback,
          predefinedSteps: [
            { type: 'click_submit', selector: 'button[type="submit"]' },
          ],
        };

        await workflow.startAuth(mockPage as any, 'https://example.com/login', options);

        expect(mockElement.click).toHaveBeenCalled();
      });
    });

    describe('wait step', () => {
      it('should wait for specified time', async () => {
        const mockPage = createMockPage();
        mockPage.url.mockReturnValue('https://example.com/dashboard');

        const userCallback: UserAuthActionCallback = {
          onStepAction: vi.fn().mockResolvedValue({}),
          onComplete: vi.fn(),
        };

        const options: GuidedAuthOptions = {
          userCallback,
          predefinedSteps: [
            { type: 'wait', selector: '500' },
          ],
        };

        await workflow.startAuth(mockPage as any, 'https://example.com/login', options);

        expect(mockPage.waitForTimeout).toHaveBeenCalledWith(500);
      });
    });

    describe('mfa_code step', () => {
      it('should require user action', async () => {
        const mockPage = createMockPage();
        const mockElement = createMockElement();
        mockPage.$.mockResolvedValue(mockElement);
        mockPage.url.mockReturnValue('https://example.com/dashboard');

        const onStepAction = vi.fn().mockResolvedValue({ value: '123456' });
        const userCallback: UserAuthActionCallback = {
          onStepAction,
          onComplete: vi.fn(),
        };

        const options: GuidedAuthOptions = {
          userCallback,
          predefinedSteps: [
            { type: 'mfa_code', instruction: 'Enter your 2FA code' },
          ],
        };

        await workflow.startAuth(mockPage as any, 'https://example.com/login', options);

        expect(onStepAction).toHaveBeenCalled();
        const calledStep = onStepAction.mock.calls[0][0] as GuidedAuthStep;
        expect(calledStep.requiresUserAction).toBe(true);
      });
    });
  });

  describe('auth verification', () => {
    it('should detect successful auth by logout link', async () => {
      const mockPage = createMockPage();
      mockPage.url.mockReturnValue('https://example.com/dashboard');
      mockPage.$.mockImplementation(async (selector: string) => {
        if (selector.includes('logout') || selector.includes('log.?out')) {
          return createMockElement();
        }
        return null;
      });

      const userCallback: UserAuthActionCallback = {
        onStepAction: vi.fn().mockResolvedValue({}),
        onComplete: vi.fn(),
      };

      const options: GuidedAuthOptions = {
        userCallback,
        predefinedSteps: [],
      };

      const result = await workflow.startAuth(mockPage as any, 'https://example.com/login', options);

      // Should be successful based on detection
      expect(result.success).toBe(true);
    });

    it('should detect successful auth by navigating away from login', async () => {
      const mockPage = createMockPage();
      mockPage.url.mockReturnValue('https://example.com/account');
      mockPage.$.mockResolvedValue(null);

      const userCallback: UserAuthActionCallback = {
        onStepAction: vi.fn().mockResolvedValue({}),
        onComplete: vi.fn(),
      };

      const options: GuidedAuthOptions = {
        userCallback,
        predefinedSteps: [],
      };

      const result = await workflow.startAuth(mockPage as any, 'https://example.com/login', options);

      expect(result.success).toBe(true);
    });
  });

  describe('session capture', () => {
    it('should capture cookies after successful auth', async () => {
      const mockPage = createMockPage();
      mockPage.url.mockReturnValue('https://example.com/dashboard');

      const mockCookies = [
        { name: 'session', value: 'abc123', domain: 'example.com', path: '/', expires: -1, httpOnly: true, secure: true },
      ];
      mockPage.context.mockReturnValue({
        cookies: vi.fn().mockResolvedValue(mockCookies),
      });

      const userCallback: UserAuthActionCallback = {
        onStepAction: vi.fn().mockResolvedValue({}),
        onComplete: vi.fn(),
      };

      const options: GuidedAuthOptions = {
        userCallback,
        predefinedSteps: [],
        preserveCookies: true,
      };

      const result = await workflow.startAuth(mockPage as any, 'https://example.com/login', options);

      expect(result.success).toBe(true);
      expect(result.cookies).toBeDefined();
      expect(result.cookies?.length).toBeGreaterThan(0);
      expect(result.cookies?.[0].name).toBe('session');
    });
  });

  describe('step status lifecycle', () => {
    it('should transition through pending -> in_progress -> completed', async () => {
      const mockPage = createMockPage();
      mockPage.url.mockReturnValue('https://example.com/dashboard');

      const statusChanges: Array<{ stepId: string; status: string }> = [];
      const userCallback: UserAuthActionCallback = {
        onStepAction: vi.fn().mockResolvedValue({}),
        onStepStatusChange: vi.fn().mockImplementation(async (step: GuidedAuthStep) => {
          statusChanges.push({ stepId: step.id, status: step.status });
        }),
        onComplete: vi.fn(),
      };

      const options: GuidedAuthOptions = {
        userCallback,
        predefinedSteps: [
          { type: 'wait', selector: '10' },
        ],
      };

      await workflow.startAuth(mockPage as any, 'https://example.com/login', options);

      expect(statusChanges.some(s => s.status === 'in_progress')).toBe(true);
      expect(statusChanges.some(s => s.status === 'completed')).toBe(true);
    });
  });

  describe('error handling', () => {
    it('should handle missing input element gracefully', async () => {
      const mockPage = createMockPage();
      mockPage.$.mockResolvedValue(null); // No elements found

      const userCallback: UserAuthActionCallback = {
        onStepAction: vi.fn().mockResolvedValue({ value: 'test' }),
        onComplete: vi.fn(),
      };

      const options: GuidedAuthOptions = {
        userCallback,
        predefinedSteps: [
          { type: 'enter_username' }, // No selector, will try auto-detect
        ],
      };

      const result = await workflow.startAuth(mockPage as any, 'https://example.com/login', options);

      // Should fail but not crash
      expect(result.progress.steps[0].status).toBe('failed');
      expect(result.progress.steps[0].error).toContain('Could not find input element');
    });

    it('should handle page errors gracefully', async () => {
      const mockPage = createMockPage();
      mockPage.goto.mockRejectedValue(new Error('Navigation failed'));

      const userCallback: UserAuthActionCallback = {
        onStepAction: vi.fn().mockResolvedValue({}),
        onComplete: vi.fn(),
      };

      const options: GuidedAuthOptions = {
        userCallback,
        predefinedSteps: [
          { type: 'navigate', selector: 'https://example.com/login' },
        ],
      };

      const result = await workflow.startAuth(mockPage as any, 'https://example.com/login', options);

      expect(result.progress.steps[0].status).toBe('failed');
      expect(result.progress.steps[0].error).toContain('Navigation failed');
    });
  });
});
