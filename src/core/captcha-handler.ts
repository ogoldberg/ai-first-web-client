/**
 * CAPTCHA Handler (GAP-007)
 *
 * Integrates the challenge-detector with SmartBrowser to provide:
 * 1. Interactive CAPTCHA detection and classification
 * 2. User callback mechanism for manual solving
 * 3. Automatic wait for resolution after user action
 * 4. Challenge state tracking and reporting
 *
 * This builds on the existing challenge-detector.ts which handles
 * the low-level element detection. This module adds the workflow
 * integration and user interaction layer.
 */

import type { Page } from 'playwright';
import type { ChallengeElement, BotDetectionType } from '../types/index.js';
import {
  detectChallengeElements,
  waitForChallengeResolution,
  type ChallengeDetectionResult,
} from './challenge-detector.js';
import { logger } from '../utils/logger.js';

const captchaLogger = logger.create('CaptchaHandler');

// ============================================
// TYPES
// ============================================

/**
 * Challenge information passed to user callback
 */
export interface ChallengeInfo {
  /** Type of bot detection system */
  type: BotDetectionType;
  /** Domain where challenge occurred */
  domain: string;
  /** Full URL of challenge page */
  url: string;
  /** Interactive elements that may need clicking */
  elements: ChallengeElement[];
  /** Whether auto-solve was attempted */
  autoSolveAttempted: boolean;
  /** Result of auto-solve attempt */
  autoSolveResult?: 'success' | 'failed' | 'no_change' | 'requires_human';
  /** Suggested action for user */
  suggestedAction: string;
  /** Detection timestamp */
  detectedAt: number;
}

/**
 * User callback for CAPTCHA handling
 * Return true if user solved the challenge, false to abort
 */
export type ChallengeCallback = (
  challenge: ChallengeInfo
) => Promise<boolean>;

/**
 * Options for CAPTCHA handling
 */
export interface CaptchaHandlerOptions {
  /** Attempt to auto-solve simple challenges (checkboxes, etc.) */
  autoSolve?: boolean;
  /** Maximum time to wait for user to solve (ms) */
  userSolveTimeout?: number;
  /** Callback when user action is required */
  onChallengeDetected?: ChallengeCallback;
  /** Skip CAPTCHA handling entirely */
  skipCaptchaHandling?: boolean;
}

/**
 * Result of CAPTCHA handling
 */
export interface CaptchaHandlingResult {
  /** Whether a challenge was detected */
  detected: boolean;
  /** Type of challenge if detected */
  challengeType?: BotDetectionType;
  /** Challenge elements found */
  elements?: ChallengeElement[];
  /** Whether challenge was resolved */
  resolved: boolean;
  /** How the challenge was resolved */
  resolutionMethod?: 'auto_wait' | 'auto_solve' | 'user_solved' | 'timeout' | 'skipped';
  /** Time spent handling the challenge (ms) */
  durationMs: number;
  /** Error message if handling failed */
  error?: string;
}

// ============================================
// CONSTANTS
// ============================================

/** Default timeout for user to solve CAPTCHA (30 seconds) */
const DEFAULT_USER_SOLVE_TIMEOUT = 30000;

/** How long to wait for automatic challenge resolution (e.g., Cloudflare JS) */
const AUTO_WAIT_TIMEOUT = 15000;

/** Interval for checking if challenge resolved */
const CHECK_INTERVAL = 1000;

/** Text patterns that indicate a waiting/processing challenge (not interactive) */
const AUTO_RESOLVE_PATTERNS = [
  /checking your browser/i,
  /just a moment/i,
  /please wait/i,
  /ddos protection/i,
  /verifying/i,
  /loading/i,
];

/** Text patterns that indicate an interactive challenge (needs user) */
const INTERACTIVE_PATTERNS = [
  /i.?m not a robot/i,
  /click to verify/i,
  /press and hold/i,
  /select all/i,
  /choose the/i,
  /pick the/i,
  /solve the/i,
  /complete the/i,
];

// ============================================
// MAIN CLASS
// ============================================

/**
 * Handles CAPTCHA challenges during browsing
 */
export class CaptchaHandler {
  private options: CaptchaHandlerOptions;

  constructor(options: CaptchaHandlerOptions = {}) {
    this.options = options;
  }

  /**
   * Handle potential CAPTCHA challenge on a page
   */
  async handleChallenge(
    page: Page,
    domain: string
  ): Promise<CaptchaHandlingResult> {
    const startTime = Date.now();

    if (this.options.skipCaptchaHandling) {
      return {
        detected: false,
        resolved: true,
        resolutionMethod: 'skipped',
        durationMs: 0,
      };
    }

    captchaLogger.debug('Checking for CAPTCHA challenge', { domain, url: page.url() });

    // Step 1: Check if this looks like a challenge page
    const pageText = await this.getPageText(page);
    const isChallengePage = this.looksLikeChallengePage(pageText);

    if (!isChallengePage) {
      return {
        detected: false,
        resolved: true,
        durationMs: Date.now() - startTime,
      };
    }

    captchaLogger.info('Challenge page detected', { domain, url: page.url() });

    // Step 2: Determine if it's auto-resolving or interactive
    const isAutoResolving = this.isAutoResolvingChallenge(pageText);

    if (isAutoResolving) {
      // Wait for automatic resolution (e.g., Cloudflare JS challenge)
      captchaLogger.debug('Auto-resolving challenge detected, waiting...');
      const autoResult = await this.waitForAutoResolution(page, domain);

      if (autoResult.resolved) {
        return {
          detected: true,
          resolved: true,
          resolutionMethod: 'auto_wait',
          durationMs: Date.now() - startTime,
        };
      }
    }

    // Step 3: Detect interactive challenge elements
    const detection = await detectChallengeElements(page, {
      autoSolve: this.options.autoSolve ?? true,
      solveTimeout: 10000,
    });

    if (!detection.detected) {
      // No interactive elements found, but page looked like challenge
      // Could be a soft block or error page
      return {
        detected: true,
        resolved: false,
        resolutionMethod: 'timeout',
        durationMs: Date.now() - startTime,
        error: 'Challenge detected but no interactive elements found',
      };
    }

    // Step 4: Check if auto-solve succeeded
    if (detection.solveResult === 'success') {
      captchaLogger.info('Challenge auto-solved successfully');
      return {
        detected: true,
        challengeType: detection.detectionType,
        elements: detection.elements,
        resolved: true,
        resolutionMethod: 'auto_solve',
        durationMs: Date.now() - startTime,
      };
    }

    // Step 5: Invoke user callback if available
    if (this.options.onChallengeDetected) {
      const challengeInfo = this.buildChallengeInfo(
        page,
        domain,
        detection
      );

      captchaLogger.info('Invoking user callback for challenge', {
        type: challengeInfo.type,
        elementCount: challengeInfo.elements.length,
        suggestedAction: challengeInfo.suggestedAction,
      });

      try {
        const userResolved = await this.options.onChallengeDetected(challengeInfo);

        if (userResolved) {
          // User claims they solved it, wait for resolution
          const resolution = await waitForChallengeResolution(
            page,
            this.options.userSolveTimeout ?? DEFAULT_USER_SOLVE_TIMEOUT
          );

          if (resolution.resolved) {
            captchaLogger.info('Challenge resolved after user action');
            return {
              detected: true,
              challengeType: detection.detectionType,
              elements: detection.elements,
              resolved: true,
              resolutionMethod: 'user_solved',
              durationMs: Date.now() - startTime,
            };
          }
        }
      } catch (error) {
        captchaLogger.error('User callback failed', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    // Step 6: Challenge not resolved
    captchaLogger.warn('Challenge could not be resolved', {
      domain,
      type: detection.detectionType,
      elementCount: detection.elements.length,
    });

    return {
      detected: true,
      challengeType: detection.detectionType,
      elements: detection.elements,
      resolved: false,
      resolutionMethod: 'timeout',
      durationMs: Date.now() - startTime,
      error: 'Challenge requires human intervention',
    };
  }

  /**
   * Get visible text from page
   */
  private async getPageText(page: Page): Promise<string> {
    try {
      return await page.evaluate(() => document.body?.innerText || '');
    } catch {
      return '';
    }
  }

  /**
   * Check if page looks like a challenge page
   */
  private looksLikeChallengePage(text: string): boolean {
    const lowerText = text.toLowerCase();

    // Check for any challenge indicator
    const allPatterns = [...AUTO_RESOLVE_PATTERNS, ...INTERACTIVE_PATTERNS];
    return allPatterns.some(pattern => pattern.test(lowerText));
  }

  /**
   * Check if challenge is auto-resolving (no user action needed)
   */
  private isAutoResolvingChallenge(text: string): boolean {
    const lowerText = text.toLowerCase();

    // Auto-resolving if it matches auto patterns but NOT interactive patterns
    const matchesAuto = AUTO_RESOLVE_PATTERNS.some(p => p.test(lowerText));
    const matchesInteractive = INTERACTIVE_PATTERNS.some(p => p.test(lowerText));

    return matchesAuto && !matchesInteractive;
  }

  /**
   * Wait for automatic challenge resolution
   */
  private async waitForAutoResolution(
    page: Page,
    domain: string
  ): Promise<{ resolved: boolean }> {
    const startTime = Date.now();

    while (Date.now() - startTime < AUTO_WAIT_TIMEOUT) {
      await new Promise(resolve => setTimeout(resolve, CHECK_INTERVAL));

      const pageText = await this.getPageText(page);

      // Check if challenge is gone
      if (!this.looksLikeChallengePage(pageText)) {
        return { resolved: true };
      }

      // Check if URL changed (redirect after challenge)
      const currentUrl = page.url();
      if (!currentUrl.includes(domain)) {
        return { resolved: true };
      }
    }

    return { resolved: false };
  }

  /**
   * Build challenge info for user callback
   */
  private buildChallengeInfo(
    page: Page,
    domain: string,
    detection: ChallengeDetectionResult
  ): ChallengeInfo {
    // Determine suggested action based on elements
    let suggestedAction = 'Please solve the CAPTCHA and click continue.';

    if (detection.elements.some(e => e.type === 'checkbox')) {
      suggestedAction = 'Click the "I\'m not a robot" checkbox.';
    } else if (detection.elements.some(e => e.type === 'captcha')) {
      suggestedAction = 'Complete the CAPTCHA challenge (image selection, etc.).';
    } else if (detection.elements.some(e => e.text?.includes('press'))) {
      suggestedAction = 'Press and hold the verification button.';
    }

    return {
      type: detection.detectionType ?? 'unknown',
      domain,
      url: page.url(),
      elements: detection.elements,
      autoSolveAttempted: detection.solveAttempted,
      autoSolveResult: detection.solveResult,
      suggestedAction,
      detectedAt: Date.now(),
    };
  }
}

// ============================================
// SINGLETON EXPORT
// ============================================

/** Default CAPTCHA handler instance (no callbacks configured) */
export const captchaHandler = new CaptchaHandler();

/**
 * Create a CAPTCHA handler with specific options
 */
export function createCaptchaHandler(options: CaptchaHandlerOptions): CaptchaHandler {
  return new CaptchaHandler(options);
}
