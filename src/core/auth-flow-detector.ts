/**
 * Auth Flow Detector (GAP-003)
 *
 * Detects authentication challenges and triggers automatic authentication flows:
 * 1. HTTP 401/403 responses
 * 2. Redirects to login pages
 * 3. Session expiration detection
 * 4. Explicit auth requirement messages
 *
 * When a challenge is detected:
 * - First, try to replay a stored login workflow
 * - If no workflow exists, fall back to user prompt
 * - After successful auth, retry the original request
 */

import { logger } from '../utils/logger.js';
import type { ProceduralMemory } from './procedural-memory.js';
import type { SessionManager } from './session-manager.js';
import type { AuthWorkflow } from './auth-workflow.js';
import type { Workflow, WorkflowReplayResult, WorkflowVariables } from '../types/workflow.js';

const authLogger = logger.create('AuthFlowDetector');

// ============================================
// TYPES
// ============================================

/**
 * Types of authentication challenges that can be detected
 */
export type AuthChallengeType =
  | 'http_401'           // HTTP 401 Unauthorized
  | 'http_403'           // HTTP 403 Forbidden
  | 'login_redirect'     // Redirect to login page
  | 'session_expired'    // Session cookies expired
  | 'auth_message'       // Explicit auth requirement in response
  | 'captcha_required';  // CAPTCHA challenge (may need auth)

/**
 * Detected authentication challenge
 */
export interface AuthChallenge {
  type: AuthChallengeType;
  statusCode?: number;
  redirectUrl?: string;
  originalUrl: string;
  domain: string;
  timestamp: number;
  message?: string;
  requiresUserAction?: boolean;
}

/**
 * Result of attempting to resolve an auth challenge
 */
export interface AuthResolutionResult {
  success: boolean;
  method: 'workflow_replay' | 'stored_credentials' | 'user_prompt' | 'skipped';
  workflowId?: string;
  error?: string;
  retryRecommended: boolean;
}

/**
 * Callback for when user action is required
 */
export type UserAuthCallback = (
  challenge: AuthChallenge,
  domain: string,
  suggestedCredentialTypes: string[]
) => Promise<boolean>;

/**
 * Options for auth flow detection
 */
export interface AuthFlowDetectorOptions {
  /** Enable automatic workflow replay */
  autoReplayWorkflow?: boolean;
  /** Enable automatic credential application */
  autoApplyCredentials?: boolean;
  /** Callback for user prompts when automation fails */
  userCallback?: UserAuthCallback;
  /** Session profile to use */
  sessionProfile?: string;
}

// ============================================
// CONSTANTS
// ============================================

/** URL patterns that indicate login/auth pages */
const LOGIN_URL_PATTERNS = [
  /\/login/i,
  /\/signin/i,
  /\/sign-in/i,
  /\/auth/i,
  /\/authenticate/i,
  /\/sso/i,
  /\/oauth/i,
  /\/session\/new/i,
  /\/account\/login/i,
  /\/users\/sign_in/i,
];

/** Query parameters that indicate auth redirects */
const AUTH_QUERY_PARAMS = [
  'redirect', 'return', 'returnTo', 'return_to', 'returnUrl', 'return_url',
  'next', 'continue', 'goto', 'target', 'destination',
];

/** Response body patterns indicating auth requirement */
const AUTH_REQUIRED_PATTERNS = [
  /please\s+log\s*in/i,
  /please\s+sign\s*in/i,
  /login\s+required/i,
  /authentication\s+required/i,
  /you\s+must\s+be\s+logged\s+in/i,
  /sign\s+in\s+to\s+continue/i,
  /session\s+has\s+expired/i,
  /session\s+timed\s+out/i,
  /access\s+denied/i,
  /unauthorized\s+access/i,
];

// ============================================
// MAIN CLASS
// ============================================

export class AuthFlowDetector {
  private proceduralMemory: ProceduralMemory | null = null;
  private sessionManager: SessionManager | null = null;
  private authWorkflow: AuthWorkflow | null = null;
  private options: AuthFlowDetectorOptions;

  constructor(options: AuthFlowDetectorOptions = {}) {
    this.options = {
      autoReplayWorkflow: true,
      autoApplyCredentials: true,
      ...options,
    };
  }

  /**
   * Wire up dependencies (optional - enables full functionality)
   */
  configure(deps: {
    proceduralMemory?: ProceduralMemory;
    sessionManager?: SessionManager;
    authWorkflow?: AuthWorkflow;
  }): void {
    if (deps.proceduralMemory) this.proceduralMemory = deps.proceduralMemory;
    if (deps.sessionManager) this.sessionManager = deps.sessionManager;
    if (deps.authWorkflow) this.authWorkflow = deps.authWorkflow;
  }

  // ============================================
  // CHALLENGE DETECTION
  // ============================================

  /**
   * Detect if a response indicates an auth challenge
   */
  detectFromResponse(
    url: string,
    statusCode: number,
    headers: Record<string, string>,
    body?: string
  ): AuthChallenge | null {
    const domain = new URL(url).hostname;

    // Check HTTP status codes
    if (statusCode === 401) {
      authLogger.info('Detected HTTP 401 Unauthorized', { url, domain });
      return {
        type: 'http_401',
        statusCode: 401,
        originalUrl: url,
        domain,
        timestamp: Date.now(),
        message: 'HTTP 401 Unauthorized',
      };
    }

    if (statusCode === 403) {
      authLogger.info('Detected HTTP 403 Forbidden', { url, domain });
      return {
        type: 'http_403',
        statusCode: 403,
        originalUrl: url,
        domain,
        timestamp: Date.now(),
        message: 'HTTP 403 Forbidden',
        // 403 might not be recoverable with auth, but could be
        requiresUserAction: true,
      };
    }

    // Check for redirects to login pages (302/303 with Location header)
    if ((statusCode === 302 || statusCode === 303 || statusCode === 307) && headers.location) {
      const redirectUrl = this.resolveRedirectUrl(url, headers.location);
      if (this.isLoginUrl(redirectUrl)) {
        authLogger.info('Detected redirect to login page', { url, redirectUrl, domain });
        return {
          type: 'login_redirect',
          statusCode,
          redirectUrl,
          originalUrl: url,
          domain,
          timestamp: Date.now(),
          message: `Redirected to login: ${redirectUrl}`,
        };
      }
    }

    // Check response body for auth messages
    if (body && this.containsAuthRequiredMessage(body)) {
      authLogger.info('Detected auth requirement in response body', { url, domain });
      return {
        type: 'auth_message',
        statusCode,
        originalUrl: url,
        domain,
        timestamp: Date.now(),
        message: 'Response indicates authentication required',
      };
    }

    return null;
  }

  /**
   * Detect auth challenge from a redirect URL
   */
  detectFromRedirect(originalUrl: string, redirectUrl: string): AuthChallenge | null {
    const domain = new URL(originalUrl).hostname;

    if (this.isLoginUrl(redirectUrl)) {
      authLogger.info('Detected navigation to login page', { originalUrl, redirectUrl, domain });
      return {
        type: 'login_redirect',
        redirectUrl,
        originalUrl,
        domain,
        timestamp: Date.now(),
        message: `Navigated to login: ${redirectUrl}`,
      };
    }

    return null;
  }

  /**
   * Check if session is expired for a domain
   */
  async detectExpiredSession(domain: string, profile?: string): Promise<AuthChallenge | null> {
    if (!this.sessionManager) {
      return null;
    }

    const health = await this.sessionManager.getSessionHealth(domain, profile);

    if (health.status === 'expired' || health.status === 'not_found') {
      authLogger.info('Detected expired/missing session', { domain, status: health.status });
      return {
        type: 'session_expired',
        originalUrl: `https://${domain}`,
        domain,
        timestamp: Date.now(),
        message: `Session ${health.status}: ${health.message}`,
      };
    }

    if (health.status === 'expiring_soon') {
      authLogger.warn('Session expiring soon', {
        domain,
        expiresInMs: health.expiresInMs,
      });
      // Don't return a challenge, but log warning
    }

    return null;
  }

  // ============================================
  // CHALLENGE RESOLUTION
  // ============================================

  /**
   * Attempt to resolve an auth challenge automatically
   */
  async resolveChallenge(
    challenge: AuthChallenge,
    variables?: WorkflowVariables
  ): Promise<AuthResolutionResult> {
    authLogger.info('Attempting to resolve auth challenge', {
      type: challenge.type,
      domain: challenge.domain,
    });

    // Step 1: Try to replay a stored login workflow
    if (this.options.autoReplayWorkflow && this.proceduralMemory) {
      const workflowResult = await this.tryLoginWorkflow(challenge.domain, variables);
      if (workflowResult.success) {
        return workflowResult;
      }
    }

    // Step 2: Try to apply stored credentials
    if (this.options.autoApplyCredentials && this.authWorkflow) {
      const credResult = await this.tryStoredCredentials(challenge.domain);
      if (credResult.success) {
        return credResult;
      }
    }

    // Step 3: Fall back to user prompt
    if (this.options.userCallback) {
      try {
        const suggestedTypes = this.getSuggestedCredentialTypes(challenge);
        const userResolved = await this.options.userCallback(
          challenge,
          challenge.domain,
          suggestedTypes
        );
        if (userResolved) {
          return {
            success: true,
            method: 'user_prompt',
            retryRecommended: true,
          };
        }
      } catch (error) {
        authLogger.warn('User callback failed', { error });
      }
    }

    // All methods failed
    authLogger.warn('Could not resolve auth challenge', {
      type: challenge.type,
      domain: challenge.domain,
    });

    return {
      success: false,
      method: 'skipped',
      error: 'No authentication method available',
      retryRecommended: false,
    };
  }

  /**
   * Try to find a login workflow for replay
   * Note: Actual workflow execution should be done by the caller with proper context
   */
  private async tryLoginWorkflow(
    domain: string,
    _variables?: WorkflowVariables
  ): Promise<AuthResolutionResult> {
    if (!this.proceduralMemory) {
      return { success: false, method: 'workflow_replay', retryRecommended: false };
    }

    // Find a login workflow for this domain
    const loginWorkflow = await this.findLoginWorkflow(domain);
    if (!loginWorkflow) {
      authLogger.debug('No login workflow found for domain', { domain });
      return { success: false, method: 'workflow_replay', retryRecommended: false };
    }

    // We found a workflow - return it so the caller can execute with proper context
    // The caller (SmartBrowser or similar) has the executeSkill callback and pageContext
    authLogger.info('Found login workflow for replay', {
      domain,
      workflowId: loginWorkflow.id,
      workflowName: loginWorkflow.name,
    });

    return {
      success: true,
      method: 'workflow_replay',
      workflowId: loginWorkflow.id,
      retryRecommended: true,
    };
  }

  /**
   * Try to apply stored credentials
   */
  private async tryStoredCredentials(domain: string): Promise<AuthResolutionResult> {
    if (!this.authWorkflow) {
      return { success: false, method: 'stored_credentials', retryRecommended: false };
    }

    try {
      const status = await this.authWorkflow.getAuthStatus(domain);

      // Check if fully configured with validated credentials
      if (status.status === 'configured') {
        const hasValidatedCred = status.configuredCredentials.some(
          cred => cred.validated && !cred.isExpired
        );
        if (hasValidatedCred) {
          authLogger.info('Found valid stored credentials', { domain });
          // Credentials are already configured - just need to retry the request
          // The authWorkflow.buildAuthenticatedRequest() will inject them
          return {
            success: true,
            method: 'stored_credentials',
            retryRecommended: true,
          };
        }
      }

      // Check if partially configured (some credentials exist but not validated)
      if (status.status === 'partially_configured' || status.configuredCredentials.length > 0) {
        const hasUnvalidatedCred = status.configuredCredentials.some(
          cred => !cred.validated && !cred.isExpired
        );
        if (hasUnvalidatedCred) {
          authLogger.warn('Stored credentials not validated', { domain });
          // Credentials exist but may be stale
          return {
            success: false,
            method: 'stored_credentials',
            error: 'Credentials not validated',
            retryRecommended: true, // Worth retrying, might still work
          };
        }
      }

      return {
        success: false,
        method: 'stored_credentials',
        retryRecommended: false,
      };
    } catch (error) {
      return {
        success: false,
        method: 'stored_credentials',
        error: error instanceof Error ? error.message : 'Unknown error',
        retryRecommended: false,
      };
    }
  }

  /**
   * Find a login workflow for a domain
   */
  private async findLoginWorkflow(domain: string): Promise<Workflow | null> {
    if (!this.proceduralMemory) {
      return null;
    }

    const workflows = this.proceduralMemory.listWorkflows();

    // Look for workflows tagged as 'login' or 'auth' for this domain
    const loginWorkflow = workflows.find(w =>
      w.domain === domain &&
      (w.tags.includes('login') || w.tags.includes('auth') || w.tags.includes('authentication'))
    );

    if (loginWorkflow) {
      return loginWorkflow;
    }

    // Also check for workflows with 'login' in the name
    const namedLoginWorkflow = workflows.find(w =>
      w.domain === domain &&
      (/login/i.test(w.name) || /sign\s*in/i.test(w.name) || /auth/i.test(w.name))
    );

    return namedLoginWorkflow || null;
  }

  // ============================================
  // HELPER METHODS
  // ============================================

  /**
   * Check if a URL is a login page
   */
  private isLoginUrl(url: string): boolean {
    try {
      const parsedUrl = new URL(url);
      const fullPath = parsedUrl.pathname + parsedUrl.search;

      // Check URL path patterns
      for (const pattern of LOGIN_URL_PATTERNS) {
        if (pattern.test(fullPath)) {
          return true;
        }
      }

      // Check for return/redirect query params (indicates redirect from protected page)
      for (const param of AUTH_QUERY_PARAMS) {
        if (parsedUrl.searchParams.has(param)) {
          return true;
        }
      }

      return false;
    } catch {
      return false;
    }
  }

  /**
   * Check if response body contains auth requirement messages
   */
  private containsAuthRequiredMessage(body: string): boolean {
    // Only check first 10KB to avoid performance issues
    const sample = body.slice(0, 10000).toLowerCase();

    for (const pattern of AUTH_REQUIRED_PATTERNS) {
      if (pattern.test(sample)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Resolve a redirect URL relative to the original URL
   */
  private resolveRedirectUrl(originalUrl: string, location: string): string {
    try {
      return new URL(location, originalUrl).toString();
    } catch {
      return location;
    }
  }

  /**
   * Get suggested credential types based on challenge
   */
  private getSuggestedCredentialTypes(challenge: AuthChallenge): string[] {
    // Based on the challenge type, suggest likely auth methods
    switch (challenge.type) {
      case 'http_401':
        return ['bearer', 'api_key', 'basic'];
      case 'http_403':
        return ['bearer', 'api_key', 'oauth'];
      case 'login_redirect':
        return ['cookie', 'oauth'];
      case 'session_expired':
        return ['cookie'];
      default:
        return ['bearer', 'api_key', 'cookie'];
    }
  }

  // ============================================
  // WORKFLOW HELPERS
  // ============================================

  /**
   * Check if a workflow is a login workflow
   */
  isLoginWorkflow(workflow: Workflow): boolean {
    // Check tags
    if (workflow.tags.some(tag =>
      ['login', 'auth', 'authentication', 'signin', 'sign-in'].includes(tag.toLowerCase())
    )) {
      return true;
    }

    // Check name
    if (/login|sign\s*in|auth/i.test(workflow.name)) {
      return true;
    }

    // Check if first step navigates to a login URL
    if (workflow.steps.length > 0 && workflow.steps[0].url) {
      return this.isLoginUrl(workflow.steps[0].url);
    }

    return false;
  }

  /**
   * Mark a workflow as a login workflow by adding appropriate tags
   */
  markAsLoginWorkflow(workflow: Workflow): void {
    if (!workflow.tags.includes('login')) {
      workflow.tags.push('login');
    }
    if (!workflow.tags.includes('auth')) {
      workflow.tags.push('auth');
    }
  }
}

// ============================================
// SINGLETON EXPORT
// ============================================

/** Default auth flow detector instance */
export const authFlowDetector = new AuthFlowDetector();
