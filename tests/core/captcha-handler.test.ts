/**
 * Tests for CAPTCHA Handler (GAP-007)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  CaptchaHandler,
  createCaptchaHandler,
  type ChallengeCallback,
  type ChallengeInfo,
} from '../../src/core/captcha-handler.js';

// Mock the challenge-detector module
vi.mock('../../src/core/challenge-detector.js', () => ({
  detectChallengeElements: vi.fn(),
  waitForChallengeResolution: vi.fn(),
}));

// Mock logger
vi.mock('../../src/utils/logger.js', () => ({
  logger: {
    create: () => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  },
}));

import { detectChallengeElements, waitForChallengeResolution } from '../../src/core/challenge-detector.js';

// Helper to create a mock Page
function createMockPage(options: {
  bodyText?: string;
  url?: string;
} = {}) {
  return {
    evaluate: vi.fn().mockImplementation(async (fn: Function) => {
      if (fn.toString().includes('innerText')) {
        return options.bodyText ?? '';
      }
      return undefined;
    }),
    url: vi.fn().mockReturnValue(options.url ?? 'https://example.com/page'),
  } as any;
}

describe('CaptchaHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor and factory', () => {
    it('should create handler with default options', () => {
      const handler = new CaptchaHandler();
      expect(handler).toBeInstanceOf(CaptchaHandler);
    });

    it('should create handler via factory function', () => {
      const handler = createCaptchaHandler({
        autoSolve: false,
        userSolveTimeout: 60000,
      });
      expect(handler).toBeInstanceOf(CaptchaHandler);
    });
  });

  describe('handleChallenge', () => {
    it('should return not detected for normal pages', async () => {
      const handler = new CaptchaHandler();
      const page = createMockPage({
        bodyText: 'Welcome to our website. Here is some content.',
      });

      const result = await handler.handleChallenge(page, 'example.com');

      expect(result.detected).toBe(false);
      expect(result.resolved).toBe(true);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should skip CAPTCHA handling when skipCaptchaHandling is true', async () => {
      const handler = createCaptchaHandler({
        skipCaptchaHandling: true,
      });
      const page = createMockPage({
        bodyText: 'Please verify you are human',
      });

      const result = await handler.handleChallenge(page, 'example.com');

      expect(result.detected).toBe(false);
      expect(result.resolved).toBe(true);
      expect(result.resolutionMethod).toBe('skipped');
    });

    it('should detect challenge page with interactive CAPTCHA elements', async () => {
      const handler = new CaptchaHandler();

      // Use text that triggers interactive detection, not auto-resolve
      // "I'm not a robot" is an INTERACTIVE_PATTERN
      const page = createMockPage({
        url: 'https://example.com/blocked',
      });

      // Return the same challenge text every time (doesn't auto-resolve)
      page.evaluate = vi.fn().mockResolvedValue("I'm not a robot - click the checkbox");

      // Mock detectChallengeElements to return elements
      vi.mocked(detectChallengeElements).mockResolvedValue({
        detected: true,
        detectionType: 'recaptcha',
        elements: [
          {
            type: 'checkbox',
            selector: '.g-recaptcha',
            text: "I'm not a robot",
            clickable: true,
            boundingBox: { x: 100, y: 100, width: 50, height: 50 },
          },
        ],
        solveAttempted: true,
        solveResult: 'requires_human',
        duration: 500,
      });

      const result = await handler.handleChallenge(page, 'example.com');

      expect(result.detected).toBe(true);
      expect(result.challengeType).toBe('recaptcha');
      expect(result.resolved).toBe(false);
      expect(result.error).toContain('human intervention');
    });

    it('should wait for auto-resolving challenges like Cloudflare', async () => {
      const handler = new CaptchaHandler();

      // First call returns challenge text, subsequent calls return normal content
      let callCount = 0;
      const page = createMockPage({
        url: 'https://example.com/page',
      });
      page.evaluate = vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount <= 2) {
          return 'Checking your browser before accessing the site. Please wait...';
        }
        return 'Welcome to our website!';
      });

      const result = await handler.handleChallenge(page, 'example.com');

      expect(result.detected).toBe(true);
      expect(result.resolved).toBe(true);
      expect(result.resolutionMethod).toBe('auto_wait');
    });

    it('should call auto-solve on checkboxes when enabled', async () => {
      const handler = createCaptchaHandler({
        autoSolve: true,
      });
      const page = createMockPage({
        bodyText: "I'm not a robot - click to verify",
        url: 'https://example.com/captcha',
      });

      // Mock successful auto-solve
      vi.mocked(detectChallengeElements).mockResolvedValue({
        detected: true,
        detectionType: 'recaptcha',
        elements: [
          {
            type: 'checkbox',
            selector: '#recaptcha',
            text: "I'm not a robot",
            clickable: true,
            clickAttempted: true,
            clickResult: 'success',
            boundingBox: { x: 100, y: 100, width: 50, height: 50 },
          },
        ],
        solveAttempted: true,
        solveResult: 'success',
        duration: 1000,
      });

      const result = await handler.handleChallenge(page, 'example.com');

      expect(result.detected).toBe(true);
      expect(result.resolved).toBe(true);
      expect(result.resolutionMethod).toBe('auto_solve');
      expect(detectChallengeElements).toHaveBeenCalledWith(page, expect.objectContaining({
        autoSolve: true,
      }));
    });

    it('should invoke user callback when auto-solve fails', async () => {
      const userCallback: ChallengeCallback = vi.fn().mockResolvedValue(true);

      const handler = createCaptchaHandler({
        onChallengeDetected: userCallback,
        userSolveTimeout: 5000,
      });
      const page = createMockPage({
        bodyText: 'Select all images with traffic lights',
        url: 'https://example.com/captcha',
      });

      // Mock detection with requires_human result
      vi.mocked(detectChallengeElements).mockResolvedValue({
        detected: true,
        detectionType: 'recaptcha',
        elements: [
          {
            type: 'captcha',
            selector: '.rc-imageselect',
            text: 'Select all images with traffic lights',
            clickable: false,
            boundingBox: { x: 50, y: 50, width: 300, height: 300 },
          },
        ],
        solveAttempted: false,
        solveResult: 'requires_human',
        duration: 500,
      });

      // Mock waitForChallengeResolution to return resolved
      vi.mocked(waitForChallengeResolution).mockResolvedValue({
        resolved: true,
        newUrl: 'https://example.com/success',
      });

      const result = await handler.handleChallenge(page, 'example.com');

      expect(userCallback).toHaveBeenCalled();
      expect(result.detected).toBe(true);
      expect(result.resolved).toBe(true);
      expect(result.resolutionMethod).toBe('user_solved');

      // Check callback received correct challenge info
      const callbackArg = vi.mocked(userCallback).mock.calls[0][0];
      expect(callbackArg.type).toBe('recaptcha');
      expect(callbackArg.domain).toBe('example.com');
      expect(callbackArg.elements).toHaveLength(1);
    });

    it('should timeout when user callback returns false', async () => {
      const userCallback: ChallengeCallback = vi.fn().mockResolvedValue(false);

      const handler = createCaptchaHandler({
        onChallengeDetected: userCallback,
      });
      const page = createMockPage({
        bodyText: 'Click to verify you are human',
        url: 'https://example.com/blocked',
      });

      vi.mocked(detectChallengeElements).mockResolvedValue({
        detected: true,
        detectionType: 'turnstile',
        elements: [
          {
            type: 'button',
            selector: '.cf-turnstile',
            text: 'Verify',
            clickable: true,
            boundingBox: { x: 100, y: 100, width: 80, height: 40 },
          },
        ],
        solveAttempted: true,
        solveResult: 'failed',
        duration: 1000,
      });

      const result = await handler.handleChallenge(page, 'example.com');

      expect(result.detected).toBe(true);
      expect(result.resolved).toBe(false);
      expect(result.resolutionMethod).toBe('timeout');
    });

    it('should handle callback errors gracefully', async () => {
      const userCallback: ChallengeCallback = vi.fn().mockRejectedValue(new Error('Callback failed'));

      const handler = createCaptchaHandler({
        onChallengeDetected: userCallback,
      });
      const page = createMockPage({
        bodyText: 'Press and hold to verify',
        url: 'https://example.com/px',
      });

      vi.mocked(detectChallengeElements).mockResolvedValue({
        detected: true,
        detectionType: 'perimeterx',
        elements: [
          {
            type: 'button',
            selector: '#px-captcha',
            text: 'Press and hold',
            clickable: true,
            boundingBox: { x: 100, y: 100, width: 200, height: 50 },
          },
        ],
        solveAttempted: true,
        solveResult: 'failed',
        duration: 500,
      });

      const result = await handler.handleChallenge(page, 'example.com');

      expect(result.detected).toBe(true);
      expect(result.resolved).toBe(false);
      // Should not throw, just return unresolved
    });

    it('should detect various challenge types', async () => {
      const testCases = [
        { text: 'Just a moment...', expectedAuto: true },
        { text: 'Checking your browser', expectedAuto: true },
        { text: 'Please wait while we verify', expectedAuto: true },
        { text: "I'm not a robot", expectedAuto: false },
        { text: 'Click to verify', expectedAuto: false },
        { text: 'Select all images containing', expectedAuto: false },
        { text: 'Press and hold the button', expectedAuto: false },
      ];

      for (const testCase of testCases) {
        vi.clearAllMocks();

        const handler = new CaptchaHandler();
        let callCount = 0;
        const page = createMockPage({
          url: 'https://example.com',
        });

        page.evaluate = vi.fn().mockImplementation(async () => {
          callCount++;
          if (callCount <= 2) {
            return testCase.text;
          }
          // For auto-resolving, return normal content after wait
          if (testCase.expectedAuto) {
            return 'Welcome!';
          }
          return testCase.text;
        });

        if (!testCase.expectedAuto) {
          vi.mocked(detectChallengeElements).mockResolvedValue({
            detected: true,
            elements: [],
            solveAttempted: false,
            duration: 100,
          });
        }

        const result = await handler.handleChallenge(page, 'example.com');

        expect(result.detected).toBe(true);
        if (testCase.expectedAuto) {
          expect(result.resolutionMethod).toBe('auto_wait');
        }
      }
    });

    it('should include timing information in results', async () => {
      const handler = new CaptchaHandler();
      const page = createMockPage({
        bodyText: 'Normal page content',
      });

      const startTime = Date.now();
      const result = await handler.handleChallenge(page, 'example.com');
      const elapsed = Date.now() - startTime;

      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(result.durationMs).toBeLessThanOrEqual(elapsed + 100);
    });
  });

  describe('challenge info building', () => {
    it('should provide appropriate suggested action for checkbox', async () => {
      const userCallback: ChallengeCallback = vi.fn().mockResolvedValue(false);

      const handler = createCaptchaHandler({
        onChallengeDetected: userCallback,
      });
      const page = createMockPage({
        bodyText: "I'm not a robot checkbox",
        url: 'https://example.com/captcha',
      });

      vi.mocked(detectChallengeElements).mockResolvedValue({
        detected: true,
        detectionType: 'recaptcha',
        elements: [
          {
            type: 'checkbox',
            selector: '#recaptcha',
            text: "I'm not a robot",
            clickable: true,
            boundingBox: { x: 100, y: 100, width: 50, height: 50 },
          },
        ],
        solveAttempted: true,
        solveResult: 'failed',
        duration: 500,
      });

      await handler.handleChallenge(page, 'example.com');

      const callbackArg = vi.mocked(userCallback).mock.calls[0][0];
      expect(callbackArg.suggestedAction).toContain('not a robot');
    });

    it('should provide appropriate suggested action for image captcha', async () => {
      const userCallback: ChallengeCallback = vi.fn().mockResolvedValue(false);

      const handler = createCaptchaHandler({
        onChallengeDetected: userCallback,
      });
      const page = createMockPage({
        bodyText: 'Select all images with traffic lights',
        url: 'https://example.com/captcha',
      });

      vi.mocked(detectChallengeElements).mockResolvedValue({
        detected: true,
        detectionType: 'recaptcha',
        elements: [
          {
            type: 'captcha',
            selector: '.rc-imageselect',
            text: 'Select all images',
            clickable: false,
            boundingBox: { x: 50, y: 50, width: 300, height: 300 },
          },
        ],
        solveAttempted: false,
        solveResult: 'requires_human',
        duration: 500,
      });

      await handler.handleChallenge(page, 'example.com');

      const callbackArg = vi.mocked(userCallback).mock.calls[0][0];
      expect(callbackArg.suggestedAction).toContain('CAPTCHA');
    });

    it('should include detection timestamp', async () => {
      const userCallback: ChallengeCallback = vi.fn().mockResolvedValue(false);

      const handler = createCaptchaHandler({
        onChallengeDetected: userCallback,
      });
      const page = createMockPage({
        bodyText: 'Click to verify',
        url: 'https://example.com/captcha',
      });

      vi.mocked(detectChallengeElements).mockResolvedValue({
        detected: true,
        elements: [{ type: 'button', selector: 'button', clickable: true }],
        solveAttempted: false,
        solveResult: 'requires_human',
        duration: 100,
      });

      const beforeTime = Date.now();
      await handler.handleChallenge(page, 'example.com');
      const afterTime = Date.now();

      const callbackArg = vi.mocked(userCallback).mock.calls[0][0];
      expect(callbackArg.detectedAt).toBeGreaterThanOrEqual(beforeTime);
      expect(callbackArg.detectedAt).toBeLessThanOrEqual(afterTime);
    });
  });

  describe('edge cases', () => {
    it('should handle empty page text', async () => {
      const handler = new CaptchaHandler();
      const page = createMockPage({
        bodyText: '',
      });

      const result = await handler.handleChallenge(page, 'example.com');

      expect(result.detected).toBe(false);
      expect(result.resolved).toBe(true);
    });

    it('should handle page.evaluate throwing error', async () => {
      const handler = new CaptchaHandler();
      const page = {
        evaluate: vi.fn().mockRejectedValue(new Error('Page closed')),
        url: vi.fn().mockReturnValue('https://example.com'),
      } as any;

      const result = await handler.handleChallenge(page, 'example.com');

      expect(result.detected).toBe(false);
      expect(result.resolved).toBe(true);
    });

    it('should handle detected but no elements found', async () => {
      const handler = new CaptchaHandler();
      const page = createMockPage({
        bodyText: "I'm not a robot",
        url: 'https://example.com/blocked',
      });

      vi.mocked(detectChallengeElements).mockResolvedValue({
        detected: false,
        elements: [],
        solveAttempted: false,
        duration: 100,
      });

      const result = await handler.handleChallenge(page, 'example.com');

      expect(result.detected).toBe(true);
      expect(result.resolved).toBe(false);
      expect(result.error).toContain('no interactive elements');
    });
  });
});
