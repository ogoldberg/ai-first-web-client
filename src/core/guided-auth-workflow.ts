/**
 * Guided Authentication Workflow (INT-010)
 *
 * Provides interactive, step-by-step authentication guidance for government portals
 * and other authenticated sites. Features:
 *
 * 1. User callback for interactive login (MFA, email verification)
 * 2. Step-by-step auth guidance with screenshots
 * 3. Session capture after successful auth
 * 4. Extensible to any authenticated portal
 *
 * Works with AuthFlowDetector to detect auth challenges and AuthWorkflow
 * to store credentials once authentication is complete.
 */

import type { Page, BrowserContext, ElementHandle } from 'playwright-core';
import { logger } from '../utils/logger.js';
import type { SessionManager } from './session-manager.js';
import type { AuthFlowDetector, AuthChallenge } from './auth-flow-detector.js';

const authLogger = logger.create('GuidedAuthWorkflow');

// ============================================
// TYPES
// ============================================

/**
 * Authentication step types
 */
export type AuthStepType =
  | 'navigate'           // Navigate to login page
  | 'enter_username'     // Enter username/email
  | 'enter_password'     // Enter password
  | 'click_submit'       // Click login/submit button
  | 'mfa_code'           // Enter MFA/2FA code
  | 'email_verify'       // Click email verification link
  | 'sms_code'           // Enter SMS code
  | 'captcha'            // Solve CAPTCHA
  | 'select_option'      // Select from dropdown/options
  | 'accept_terms'       // Accept terms/conditions
  | 'security_question'  // Answer security question
  | 'wait'               // Wait for redirect/processing
  | 'custom';            // Custom user action

/**
 * Status of an authentication step
 */
export type AuthStepStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped';

/**
 * Single step in the guided auth workflow
 */
export interface GuidedAuthStep {
  /** Unique step ID */
  id: string;
  /** Step type */
  type: AuthStepType;
  /** Step sequence number */
  sequence: number;
  /** Human-readable instruction */
  instruction: string;
  /** Detailed description/hint */
  description?: string;
  /** Current status */
  status: AuthStepStatus;
  /** CSS selector for the target element (if applicable) */
  selector?: string;
  /** Expected value pattern (for validation) */
  expectedPattern?: RegExp | string;
  /** Screenshot of the current step (base64) */
  screenshot?: string;
  /** Screenshot file path */
  screenshotPath?: string;
  /** When the step was started */
  startedAt?: number;
  /** When the step was completed */
  completedAt?: number;
  /** Error message if step failed */
  error?: string;
  /** User input for this step (masked for passwords) */
  userInput?: string;
  /** Whether this step requires user action */
  requiresUserAction: boolean;
  /** Auto-detect selector hints */
  selectorHints?: string[];
}

/**
 * Authentication session progress
 */
export interface AuthSessionProgress {
  /** Unique session ID */
  sessionId: string;
  /** Domain being authenticated */
  domain: string;
  /** Target URL that triggered auth */
  targetUrl: string;
  /** Current step index */
  currentStepIndex: number;
  /** All steps */
  steps: GuidedAuthStep[];
  /** Overall status */
  status: 'not_started' | 'in_progress' | 'completed' | 'failed' | 'cancelled';
  /** When auth session started */
  startedAt: number;
  /** When auth session completed */
  completedAt?: number;
  /** Error message if failed */
  error?: string;
  /** Whether session was successfully captured */
  sessionCaptured: boolean;
  /** Final screenshot after auth */
  finalScreenshot?: string;
}

/**
 * User action callback for interactive auth
 */
export interface UserAuthActionCallback {
  /** Called when a step requires user input */
  onStepAction: (
    step: GuidedAuthStep,
    progress: AuthSessionProgress
  ) => Promise<{
    /** The value/action to perform */
    value?: string;
    /** Whether to skip this step */
    skip?: boolean;
    /** Whether to cancel the entire workflow */
    cancel?: boolean;
  }>;

  /** Called when a screenshot is taken (for UI display) */
  onScreenshot?: (
    screenshot: string,
    step: GuidedAuthStep,
    progress: AuthSessionProgress
  ) => Promise<void>;

  /** Called when step status changes */
  onStepStatusChange?: (
    step: GuidedAuthStep,
    progress: AuthSessionProgress
  ) => Promise<void>;

  /** Called when auth completes (success or failure) */
  onComplete?: (
    success: boolean,
    progress: AuthSessionProgress,
    error?: string
  ) => Promise<void>;
}

/**
 * Options for starting a guided auth session
 */
export interface GuidedAuthOptions {
  /** User callback for interactive actions */
  userCallback: UserAuthActionCallback;
  /** Whether to capture screenshots at each step */
  captureScreenshots?: boolean;
  /** Directory to save screenshots */
  screenshotDir?: string;
  /** Session profile name */
  sessionProfile?: string;
  /** Maximum time to wait for auth (ms) */
  maxAuthTimeMs?: number;
  /** Whether to auto-detect login form elements */
  autoDetectForm?: boolean;
  /** Predefined steps (for known sites) */
  predefinedSteps?: Array<Partial<GuidedAuthStep>>;
  /** Cookies to preserve through auth */
  preserveCookies?: boolean;
}

/**
 * Result of a guided auth session
 */
export interface GuidedAuthResult {
  /** Whether authentication was successful */
  success: boolean;
  /** The progress object with all step details */
  progress: AuthSessionProgress;
  /** Session ID for future use */
  sessionId?: string;
  /** Captured cookies (if preserveCookies is true) */
  cookies?: Array<{
    name: string;
    value: string;
    domain: string;
    path: string;
    expires: number;
    httpOnly: boolean;
    secure: boolean;
  }>;
  /** Error message if failed */
  error?: string;
}

// ============================================
// CONSTANTS
// ============================================

/** Common login form selectors to try */
const USERNAME_SELECTORS = [
  'input[type="email"]',
  'input[name="email"]',
  'input[name="username"]',
  'input[name="user"]',
  'input[name="login"]',
  'input[id*="email"]',
  'input[id*="username"]',
  'input[id*="user"]',
  'input[placeholder*="email"]',
  'input[placeholder*="username"]',
  'input[autocomplete="email"]',
  'input[autocomplete="username"]',
];

const PASSWORD_SELECTORS = [
  'input[type="password"]',
  'input[name="password"]',
  'input[name="pass"]',
  'input[id*="password"]',
  'input[placeholder*="password"]',
  'input[autocomplete="current-password"]',
];

const SUBMIT_SELECTORS = [
  'button[type="submit"]',
  'input[type="submit"]',
  'button:has-text("log in")',
  'button:has-text("login")',
  'button:has-text("sign in")',
  'button:has-text("signin")',
  'button:has-text("enter")',
  'button:has-text("continue")',
  'button:has-text("submit")',
  '[data-testid*="login"]',
  '[data-testid*="submit"]',
];

const MFA_CODE_SELECTORS = [
  'input[name="code"]',
  'input[name="otp"]',
  'input[name="totp"]',
  'input[name="mfa"]',
  'input[name="verification"]',
  'input[id*="code"]',
  'input[id*="otp"]',
  'input[id*="mfa"]',
  'input[id*="verification"]',
  'input[placeholder*="code"]',
  'input[placeholder*="verification"]',
  'input[autocomplete="one-time-code"]',
];

const DEFAULT_MAX_AUTH_TIME_MS = 5 * 60 * 1000; // 5 minutes

// ============================================
// MAIN CLASS
// ============================================

export class GuidedAuthWorkflow {
  private sessionManager: SessionManager | null = null;
  private authFlowDetector: AuthFlowDetector | null = null;
  private activeSessions: Map<string, AuthSessionProgress> = new Map();

  constructor() {}

  /**
   * Configure dependencies
   */
  configure(deps: {
    sessionManager?: SessionManager;
    authFlowDetector?: AuthFlowDetector;
  }): void {
    if (deps.sessionManager) this.sessionManager = deps.sessionManager;
    if (deps.authFlowDetector) this.authFlowDetector = deps.authFlowDetector;
  }

  /**
   * Start a guided authentication workflow
   */
  async startAuth(
    page: Page,
    loginUrl: string,
    options: GuidedAuthOptions
  ): Promise<GuidedAuthResult> {
    const domain = new URL(loginUrl).hostname;
    const sessionId = this.generateSessionId();

    const progress: AuthSessionProgress = {
      sessionId,
      domain,
      targetUrl: loginUrl,
      currentStepIndex: 0,
      steps: [],
      status: 'not_started',
      startedAt: Date.now(),
      sessionCaptured: false,
    };

    this.activeSessions.set(sessionId, progress);

    authLogger.info('Starting guided auth workflow', { sessionId, domain, loginUrl });

    try {
      // Initialize steps
      if (options.predefinedSteps && options.predefinedSteps.length > 0) {
        progress.steps = options.predefinedSteps.map((step, index) =>
          this.createStep(step.type || 'custom', index, step)
        );
      } else if (options.autoDetectForm !== false) {
        // Auto-detect form and create steps
        await this.autoDetectAndCreateSteps(page, loginUrl, progress, options);
      }

      progress.status = 'in_progress';

      // Execute each step
      for (let i = 0; i < progress.steps.length; i++) {
        // Check timeout
        const elapsed = Date.now() - progress.startedAt;
        if (elapsed > (options.maxAuthTimeMs || DEFAULT_MAX_AUTH_TIME_MS)) {
          throw new Error('Authentication timeout exceeded');
        }

        progress.currentStepIndex = i;
        const step = progress.steps[i];

        const stepResult = await this.executeStep(page, step, progress, options);

        if (stepResult.cancelled) {
          progress.status = 'cancelled';
          break;
        }

        if (stepResult.failed) {
          // Don't fail entire workflow on one step failure unless critical
          const criticalSteps: AuthStepType[] = [
            'enter_username',
            'enter_password',
            'mfa_code',
            'sms_code',
            'security_question',
          ];
          if (criticalSteps.includes(step.type)) {
            throw new Error(step.error || `Critical step '${step.type}' failed`);
          }
        }
      }

      // Check if auth was successful
      const authSuccess = await this.verifyAuthSuccess(page, domain);

      if (authSuccess) {
        progress.status = 'completed';
        progress.completedAt = Date.now();

        // Capture session
        if (this.sessionManager && options.preserveCookies !== false) {
          await this.captureSession(page, domain, options.sessionProfile, progress);
        }

        // Take final screenshot
        if (options.captureScreenshots) {
          progress.finalScreenshot = await this.takeScreenshot(page);
        }

        authLogger.info('Guided auth completed successfully', {
          sessionId,
          domain,
          duration: progress.completedAt - progress.startedAt,
        });
      } else if (progress.status !== 'cancelled') {
        progress.status = 'failed';
        progress.error = 'Authentication verification failed';
      }

      // Call completion callback
      if (options.userCallback.onComplete) {
        await options.userCallback.onComplete(
          progress.status === 'completed',
          progress,
          progress.error
        );
      }

      // Build result
      const result: GuidedAuthResult = {
        success: progress.status === 'completed',
        progress,
        sessionId: progress.status === 'completed' ? sessionId : undefined,
        error: progress.error,
      };

      // Get cookies if requested
      if (options.preserveCookies && progress.status === 'completed') {
        const context = page.context();
        const cookies = await context.cookies();
        result.cookies = this.filterDomainCookies(cookies, domain).map(c => ({
            name: c.name,
            value: c.value,
            domain: c.domain,
            path: c.path,
            expires: c.expires,
            httpOnly: c.httpOnly,
            secure: c.secure,
          }));
      }

      return result;
    } catch (error) {
      progress.status = 'failed';
      progress.error = error instanceof Error ? error.message : String(error);
      progress.completedAt = Date.now();

      authLogger.error('Guided auth failed', {
        sessionId,
        domain,
        error: progress.error,
      });

      if (options.userCallback.onComplete) {
        await options.userCallback.onComplete(false, progress, progress.error);
      }

      return {
        success: false,
        progress,
        error: progress.error,
      };
    } finally {
      this.activeSessions.delete(sessionId);
    }
  }

  /**
   * Resume a paused auth session (e.g., after email verification)
   */
  async resumeAuth(
    page: Page,
    sessionId: string,
    options: GuidedAuthOptions
  ): Promise<GuidedAuthResult> {
    const progress = this.activeSessions.get(sessionId);
    if (!progress) {
      const error = 'Session not found or expired';
      return {
        success: false,
        progress: {
          sessionId,
          domain: '',
          targetUrl: '',
          currentStepIndex: 0,
          steps: [],
          status: 'failed',
          startedAt: Date.now(),
          completedAt: Date.now(),
          sessionCaptured: false,
          error,
        },
        error,
      };
    }

    // Continue from where we left off
    return this.startAuth(page, progress.targetUrl, {
      ...options,
      predefinedSteps: progress.steps.slice(progress.currentStepIndex),
    });
  }

  /**
   * Get active auth session progress
   */
  getSessionProgress(sessionId: string): AuthSessionProgress | undefined {
    return this.activeSessions.get(sessionId);
  }

  /**
   * Cancel an active auth session
   */
  cancelSession(sessionId: string): boolean {
    const progress = this.activeSessions.get(sessionId);
    if (progress) {
      progress.status = 'cancelled';
      progress.completedAt = Date.now();
      this.activeSessions.delete(sessionId);
      return true;
    }
    return false;
  }

  // ============================================
  // STEP EXECUTION
  // ============================================

  /**
   * Execute a single auth step
   */
  private async executeStep(
    page: Page,
    step: GuidedAuthStep,
    progress: AuthSessionProgress,
    options: GuidedAuthOptions
  ): Promise<{ completed: boolean; cancelled?: boolean; failed?: boolean }> {
    step.status = 'in_progress';
    step.startedAt = Date.now();

    if (options.userCallback.onStepStatusChange) {
      await options.userCallback.onStepStatusChange(step, progress);
    }

    // Take screenshot before step
    if (options.captureScreenshots) {
      try {
        step.screenshot = await this.takeScreenshot(page);
        step.screenshotPath = options.screenshotDir
          ? `${options.screenshotDir}/step-${step.sequence}-${step.type}.png`
          : undefined;

        if (options.userCallback.onScreenshot) {
          await options.userCallback.onScreenshot(step.screenshot, step, progress);
        }
      } catch (e) {
        authLogger.warn('Failed to take screenshot', { error: e });
      }
    }

    try {
      // Handle step based on type
      switch (step.type) {
        case 'navigate':
          await this.executeNavigateStep(page, step);
          break;

        case 'enter_username':
        case 'enter_password':
        case 'mfa_code':
        case 'sms_code':
        case 'security_question':
          await this.executeInputStep(page, step, progress, options);
          break;

        case 'click_submit':
        case 'accept_terms':
          await this.executeClickStep(page, step);
          break;

        case 'wait':
          await this.executeWaitStep(page, step);
          break;

        case 'email_verify':
          // This pauses the workflow - user needs to click email link
          await this.executeEmailVerifyStep(step, progress, options);
          break;

        case 'captcha':
          await this.executeCaptchaStep(page, step, progress, options);
          break;

        case 'select_option':
          await this.executeSelectStep(page, step, progress, options);
          break;

        case 'custom':
          await this.executeCustomStep(page, step, progress, options);
          break;
      }

      // Only mark as completed if not already skipped
      // Cast to check for 'skipped' since step might have been marked skipped during execution
      if ((step.status as AuthStepStatus) !== 'skipped') {
        step.status = 'completed';
      }
      step.completedAt = Date.now();

      if (options.userCallback.onStepStatusChange) {
        await options.userCallback.onStepStatusChange(step, progress);
      }

      return { completed: true };
    } catch (error) {
      step.status = 'failed';
      step.error = error instanceof Error ? error.message : String(error);
      step.completedAt = Date.now();

      if (options.userCallback.onStepStatusChange) {
        await options.userCallback.onStepStatusChange(step, progress);
      }

      // Check if user wants to cancel
      if (step.error === 'cancelled') {
        return { completed: false, cancelled: true };
      }

      return { completed: false, failed: true };
    }
  }

  private async executeNavigateStep(page: Page, step: GuidedAuthStep): Promise<void> {
    if (step.selector) {
      await page.goto(step.selector, { waitUntil: 'networkidle' });
    }
    // Wait for page to load
    await page.waitForLoadState('domcontentloaded');
  }

  private async executeInputStep(
    page: Page,
    step: GuidedAuthStep,
    progress: AuthSessionProgress,
    options: GuidedAuthOptions
  ): Promise<void> {
    // Get user input
    const response = await options.userCallback.onStepAction(step, progress);

    if (response.cancel) {
      throw new Error('cancelled');
    }

    if (response.skip) {
      step.status = 'skipped';
      return;
    }

    if (!response.value) {
      throw new Error('No value provided for input step');
    }

    // Find the input element
    let element: ElementHandle<SVGElement | HTMLElement> | null = null;
    const selectors = step.selector ? [step.selector] : this.getSelectorsForStepType(step.type);

    for (const selector of selectors) {
      try {
        const found = await page.$(selector);
        if (found) {
          // Check if element is visible and enabled
          const isVisible = await found.isVisible();
          const isEnabled = await found.isEnabled();
          if (isVisible && isEnabled) {
            element = found;
            break;
          }
        }
      } catch (e) {
        authLogger.debug('Selector failed, trying next', { selector, error: e });
        // Continue to next selector
      }
    }

    if (!element) {
      throw new Error(`Could not find input element for ${step.type}`);
    }

    // Clear and fill the input
    await element.fill('');
    await element.fill(response.value);

    // Store masked value for password, full value otherwise
    step.userInput = step.type === 'enter_password' ? '***' : response.value;
  }

  private async executeClickStep(page: Page, step: GuidedAuthStep): Promise<void> {
    const selectors = step.selector ? [step.selector] : SUBMIT_SELECTORS;

    for (const selector of selectors) {
      try {
        const element = await page.$(selector);
        if (element) {
          const isVisible = await element.isVisible();
          const isEnabled = await element.isEnabled();
          if (isVisible && isEnabled) {
            await element.click();
            // Wait for navigation or network idle (either completing means page updated)
            await Promise.any([
              page.waitForNavigation({ timeout: 5000 }),
              page.waitForLoadState('networkidle', { timeout: 5000 }),
            ]).catch(() => {
              // It's okay if both time out; it might be a simple form with no navigation
              authLogger.debug('No navigation or network idle detected after click');
            });
            return;
          }
        }
      } catch (e) {
        authLogger.debug('Selector failed, trying next', { selector, error: e });
        // Continue to next selector
      }
    }

    throw new Error('Could not find clickable submit element');
  }

  private async executeWaitStep(page: Page, step: GuidedAuthStep): Promise<void> {
    const waitTime = parseInt(step.selector || '2000', 10);
    await page.waitForTimeout(waitTime);
  }

  private async executeEmailVerifyStep(
    step: GuidedAuthStep,
    progress: AuthSessionProgress,
    options: GuidedAuthOptions
  ): Promise<void> {
    // This step requires user to check email and click link
    const response = await options.userCallback.onStepAction(step, progress);

    if (response.cancel) {
      throw new Error('cancelled');
    }

    if (response.skip) {
      step.status = 'skipped';
    }

    // User confirmed they clicked the email link
  }

  private async executeCaptchaStep(
    page: Page,
    step: GuidedAuthStep,
    progress: AuthSessionProgress,
    options: GuidedAuthOptions
  ): Promise<void> {
    // Notify user about CAPTCHA
    const response = await options.userCallback.onStepAction(step, progress);

    if (response.cancel) {
      throw new Error('cancelled');
    }

    if (response.skip) {
      step.status = 'skipped';
      return;
    }

    // Wait for user to solve CAPTCHA
    // User confirms when done
  }

  private async executeSelectStep(
    page: Page,
    step: GuidedAuthStep,
    progress: AuthSessionProgress,
    options: GuidedAuthOptions
  ): Promise<void> {
    const response = await options.userCallback.onStepAction(step, progress);

    if (response.cancel) {
      throw new Error('cancelled');
    }

    if (response.skip) {
      step.status = 'skipped';
      return;
    }

    if (!response.value || !step.selector) {
      throw new Error('No value or selector for select step');
    }

    await page.selectOption(step.selector, response.value);
    step.userInput = response.value;
  }

  private async executeCustomStep(
    page: Page,
    step: GuidedAuthStep,
    progress: AuthSessionProgress,
    options: GuidedAuthOptions
  ): Promise<void> {
    const response = await options.userCallback.onStepAction(step, progress);

    if (response.cancel) {
      throw new Error('cancelled');
    }

    if (response.skip) {
      step.status = 'skipped';
    }

    // Custom steps are handled by the user callback
  }

  // ============================================
  // AUTO-DETECTION
  // ============================================

  /**
   * Auto-detect login form and create steps
   */
  private async autoDetectAndCreateSteps(
    page: Page,
    loginUrl: string,
    progress: AuthSessionProgress,
    options: GuidedAuthOptions
  ): Promise<void> {
    // Navigate to login page first
    await page.goto(loginUrl, { waitUntil: 'networkidle' });

    const steps: GuidedAuthStep[] = [];
    let sequence = 0;

    // Check for username/email field
    for (const selector of USERNAME_SELECTORS) {
      const element = await page.$(selector);
      if (element && (await element.isVisible())) {
        steps.push(
          this.createStep('enter_username', sequence++, {
            selector,
            instruction: 'Enter your username or email address',
            requiresUserAction: true,
            selectorHints: USERNAME_SELECTORS,
          })
        );
        break;
      }
    }

    // Check for password field
    for (const selector of PASSWORD_SELECTORS) {
      const element = await page.$(selector);
      if (element && (await element.isVisible())) {
        steps.push(
          this.createStep('enter_password', sequence++, {
            selector,
            instruction: 'Enter your password',
            requiresUserAction: true,
            selectorHints: PASSWORD_SELECTORS,
          })
        );
        break;
      }
    }

    // Check for submit button
    for (const selector of SUBMIT_SELECTORS) {
      const element = await page.$(selector);
      if (element && (await element.isVisible())) {
        steps.push(
          this.createStep('click_submit', sequence++, {
            selector,
            instruction: 'Click to log in',
            requiresUserAction: false,
            selectorHints: SUBMIT_SELECTORS,
          })
        );
        break;
      }
    }

    // Add a wait step after submit
    steps.push(
      this.createStep('wait', sequence++, {
        selector: '2000',
        instruction: 'Waiting for login to complete...',
        requiresUserAction: false,
      })
    );

    progress.steps = steps;

    if (steps.length === 1) {
      // Only wait step - couldn't detect form
      authLogger.warn('Could not auto-detect login form', { loginUrl });
    } else {
      authLogger.info('Auto-detected login form', {
        loginUrl,
        stepCount: steps.length,
      });
    }
  }

  // ============================================
  // SESSION CAPTURE
  // ============================================

  /**
   * Capture session after successful auth
   */
  private async captureSession(
    page: Page,
    domain: string,
    profile: string | undefined,
    progress: AuthSessionProgress
  ): Promise<void> {
    if (!this.sessionManager) {
      authLogger.warn('SessionManager not configured, skipping session capture');
      return;
    }

    try {
      const context = page.context();
      const cookies = await context.cookies();
      const domainCookies = this.filterDomainCookies(cookies, domain);

      if (domainCookies.length > 0) {
        // Store session via SessionManager - pass the BrowserContext
        await this.sessionManager.saveSession(domain, context, profile || 'guided-auth');
        progress.sessionCaptured = true;

        authLogger.info('Session captured', {
          domain,
          profile: profile || 'guided-auth',
          cookieCount: domainCookies.length,
        });
      }
    } catch (error) {
      authLogger.error('Failed to capture session', { domain, error });
    }
  }

  // ============================================
  // VERIFICATION
  // ============================================

  /**
   * Verify authentication was successful
   */
  private async verifyAuthSuccess(page: Page, domain: string): Promise<boolean> {
    // Check multiple indicators of successful auth

    // 1. Check if still on login page (failure indicator)
    const currentUrl = page.url();
    const isStillOnLogin =
      /\/(login|signin|sign-in|auth|authenticate)/i.test(currentUrl) &&
      !/\/(logout|signout|dashboard|home|account)/i.test(currentUrl);

    if (isStillOnLogin) {
      // Check for error messages
      const hasError = await page
        .$('text=/error|invalid|incorrect|failed/i')
        .then(e => e !== null)
        .catch(() => false);
      if (hasError) {
        return false;
      }
    }

    // 2. Check for common success indicators
    const hasLogoutLink = await page
      .$('text=/log.?out|sign.?out/i, a[href*="logout"], button:has-text("logout")')
      .then(e => e !== null)
      .catch(() => false);

    if (hasLogoutLink) {
      return true;
    }

    // 3. Check for user-specific elements (profile, account, etc.)
    const hasUserElements = await page
      .$('[class*="profile"], [class*="account"], [class*="user-menu"], [id*="user"]')
      .then(e => e !== null)
      .catch(() => false);

    if (hasUserElements) {
      return true;
    }

    // 4. Check if we navigated away from login to a new page
    if (!isStillOnLogin) {
      return true;
    }

    // Default to checking for session cookies
    const context = page.context();
    const cookies = await context.cookies();
    const domainCookies = this.filterDomainCookies(cookies, domain);
    const hasSessionCookies = domainCookies.some(
      c =>
        c.name.toLowerCase().includes('session') ||
        c.name.toLowerCase().includes('auth') ||
        c.name.toLowerCase().includes('token')
    );

    return hasSessionCookies;
  }

  // ============================================
  // HELPERS
  // ============================================

  /**
   * Checks if a cookie belongs to the given domain (handles subdomain matching)
   */
  private isCookieForDomain(cookieDomain: string, domain: string): boolean {
    return cookieDomain.includes(domain) || domain.includes(cookieDomain.replace(/^\./, ''));
  }

  /**
   * Filters cookies that belong to the given domain
   */
  private filterDomainCookies<T extends { domain: string }>(cookies: T[], domain: string): T[] {
    return cookies.filter(c => this.isCookieForDomain(c.domain, domain));
  }

  private createStep(
    type: AuthStepType,
    sequence: number,
    overrides?: Partial<GuidedAuthStep>
  ): GuidedAuthStep {
    const defaultInstructions: Record<AuthStepType, string> = {
      navigate: 'Navigate to the login page',
      enter_username: 'Enter your username or email',
      enter_password: 'Enter your password',
      click_submit: 'Click the login button',
      mfa_code: 'Enter your multi-factor authentication code',
      email_verify: 'Check your email and click the verification link',
      sms_code: 'Enter the code sent to your phone',
      captcha: 'Complete the CAPTCHA challenge',
      select_option: 'Select an option',
      accept_terms: 'Accept the terms and conditions',
      security_question: 'Answer the security question',
      wait: 'Please wait...',
      custom: 'Complete this action',
    };

    return {
      id: `step-${sequence}-${type}`,
      type,
      sequence,
      instruction: overrides?.instruction || defaultInstructions[type],
      status: 'pending',
      requiresUserAction: this.stepRequiresUserAction(type),
      ...overrides,
    };
  }

  private stepRequiresUserAction(type: AuthStepType): boolean {
    return [
      'enter_username',
      'enter_password',
      'mfa_code',
      'sms_code',
      'email_verify',
      'captcha',
      'security_question',
      'custom',
    ].includes(type);
  }

  private getSelectorsForStepType(type: AuthStepType): string[] {
    switch (type) {
      case 'enter_username':
        return USERNAME_SELECTORS;
      case 'enter_password':
        return PASSWORD_SELECTORS;
      case 'mfa_code':
      case 'sms_code':
        return MFA_CODE_SELECTORS;
      case 'click_submit':
      case 'accept_terms':
        return SUBMIT_SELECTORS;
      default:
        return [];
    }
  }

  private generateSessionId(): string {
    return `guided-auth-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  }

  private async takeScreenshot(page: Page): Promise<string> {
    const buffer = await page.screenshot({ type: 'png', fullPage: false });
    return buffer.toString('base64');
  }
}

// ============================================
// SINGLETON EXPORT
// ============================================

/** Default guided auth workflow instance */
export const guidedAuthWorkflow = new GuidedAuthWorkflow();
