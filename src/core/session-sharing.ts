/**
 * Session Sharing (GAP-009)
 *
 * Enables cross-domain session sharing for SSO-authenticated domains.
 * When a user authenticates via SSO on one domain, their session can be
 * shared with other domains that use the same identity provider.
 *
 * Key features:
 * - Detects SSO flows during browsing
 * - Correlates domains by identity provider
 * - Shares session data across related domains
 * - Validates session before sharing (to avoid stale credentials)
 */

import { logger } from '../utils/logger.js';
import type { SessionManager, SessionHealth } from './session-manager.js';
import type { SessionStore } from '../types/index.js';
import { SSOFlowDetector, type SSOFlowInfo, type SSODetectorOptions } from './sso-flow-detector.js';
import { DomainCorrelator, type DomainGroup, type CorrelatorState } from './domain-correlator.js';

const sharingLogger = logger.create('SessionSharing');

// ============================================
// TYPES
// ============================================

/**
 * Result of attempting to share a session
 */
export interface SessionShareResult {
  success: boolean;
  sourceDomain: string;
  targetDomain: string;
  providerId?: string;
  /** What was shared (cookies, localStorage, etc.) */
  sharedItems?: string[];
  /** Why sharing failed (if applicable) */
  error?: string;
  /** Confidence in the shared session working */
  confidence?: number;
}

/**
 * A candidate domain from which to borrow a session
 */
export interface SessionCandidate {
  domain: string;
  providerId: string;
  confidence: number;
  sessionHealth?: SessionHealth;
  lastUsed?: number;
}

/**
 * Options for session sharing
 */
export interface SessionSharingOptions {
  /** Minimum confidence required to share a session */
  minConfidence?: number;
  /** Include localStorage in sharing */
  shareLocalStorage?: boolean;
  /** Include sessionStorage in sharing */
  shareSessionStorage?: boolean;
  /** Only share IdP-related cookies (vs all cookies) */
  filterCookies?: boolean;
  /** Profile to use for sessions */
  sessionProfile?: string;
}

/**
 * Configuration for the SessionSharingService
 */
export interface SessionSharingConfig {
  ssoDetectorOptions?: SSODetectorOptions;
  defaultSharingOptions?: SessionSharingOptions;
}

// ============================================
// CONSTANTS
// ============================================

const DEFAULT_MIN_CONFIDENCE = 0.5;
const IDP_COOKIE_PATTERNS = [
  /session/i,
  /auth/i,
  /token/i,
  /login/i,
  /sso/i,
  /id_token/i,
  /access_token/i,
  /refresh_token/i,
  // Note: _ga (Google Analytics) cookies are intentionally excluded for privacy
  // as they track user behavior across sites beyond what's needed for SSO
];

// ============================================
// SESSION SHARING SERVICE
// ============================================

export class SessionSharingService {
  private sessionManager: SessionManager;
  private ssoDetector: SSOFlowDetector;
  private correlator: DomainCorrelator;
  private config: Required<SessionSharingConfig>;
  private defaultOptions: Required<SessionSharingOptions>;

  constructor(
    sessionManager: SessionManager,
    config: SessionSharingConfig = {}
  ) {
    this.sessionManager = sessionManager;
    this.ssoDetector = new SSOFlowDetector(config.ssoDetectorOptions);
    this.correlator = new DomainCorrelator();
    this.config = {
      ssoDetectorOptions: config.ssoDetectorOptions || {},
      defaultSharingOptions: config.defaultSharingOptions || {},
    };
    this.defaultOptions = {
      minConfidence: config.defaultSharingOptions?.minConfidence ?? DEFAULT_MIN_CONFIDENCE,
      shareLocalStorage: config.defaultSharingOptions?.shareLocalStorage ?? true,
      shareSessionStorage: config.defaultSharingOptions?.shareSessionStorage ?? false,
      filterCookies: config.defaultSharingOptions?.filterCookies ?? true,
      sessionProfile: config.defaultSharingOptions?.sessionProfile ?? 'default',
    };
  }

  /**
   * Process a URL for SSO flow detection
   * Call this when navigating to capture SSO flows
   */
  processUrl(url: string, initiatingDomain?: string): SSOFlowInfo | null {
    const flow = this.ssoDetector.detectFromUrl(url, initiatingDomain);
    if (flow) {
      // Learn the domain relationship
      this.correlator.learnFromFlow(flow);
      sharingLogger.info('Detected and learned SSO flow', {
        provider: flow.provider.name,
        initiatingDomain: flow.initiatingDomain,
        targetDomain: flow.targetDomain,
      });
    }
    return flow;
  }

  /**
   * Process page content for social login detection
   */
  processContent(html: string, currentDomain: string): SSOFlowInfo[] {
    const flows = this.ssoDetector.detectFromContent(html, currentDomain);
    for (const flow of flows) {
      this.correlator.learnFromFlow(flow);
    }
    return flows;
  }

  /**
   * Find domains that could share a session with the target domain
   */
  async findSessionCandidates(
    targetDomain: string,
    options?: SessionSharingOptions
  ): Promise<SessionCandidate[]> {
    const opts = { ...this.defaultOptions, ...options };
    const candidates: SessionCandidate[] = [];

    // Get related domains from the correlator
    const relatedDomains = this.correlator.getRelatedDomains(targetDomain, opts.minConfidence);

    for (const sourceDomain of relatedDomains) {
      // Check if we have a session for this domain
      const sessionHealth = await this.sessionManager.getSessionHealth(
        sourceDomain,
        opts.sessionProfile
      );

      if (sessionHealth.status === 'healthy' || sessionHealth.status === 'expiring_soon') {
        const sharedProvider = this.correlator.findSharedProvider(sourceDomain, targetDomain);
        if (sharedProvider) {
          candidates.push({
            domain: sourceDomain,
            providerId: sharedProvider.providerId,
            confidence: sharedProvider.confidence,
            sessionHealth,
            lastUsed: sessionHealth.lastUsed,
          });
        }
      }
    }

    // Sort by confidence and session freshness
    candidates.sort((a, b) => {
      const confidenceDiff = b.confidence - a.confidence;
      if (Math.abs(confidenceDiff) > 0.1) return confidenceDiff;
      // Prefer more recently used sessions
      return (b.lastUsed || 0) - (a.lastUsed || 0);
    });

    sharingLogger.debug('Found session candidates', {
      targetDomain,
      candidateCount: candidates.length,
      candidates: candidates.map(c => ({ domain: c.domain, confidence: c.confidence })),
    });

    return candidates;
  }

  /**
   * Attempt to get a usable session for the target domain by checking related domains
   */
  async getOrShareSession(
    targetDomain: string,
    options?: SessionSharingOptions
  ): Promise<SessionShareResult | null> {
    const opts = { ...this.defaultOptions, ...options };

    // First, check if we already have a valid session for the target
    const existingHealth = await this.sessionManager.getSessionHealth(
      targetDomain,
      opts.sessionProfile
    );

    if (existingHealth.status === 'healthy') {
      sharingLogger.debug('Target domain already has valid session', { targetDomain });
      return {
        success: true,
        sourceDomain: targetDomain,
        targetDomain,
        sharedItems: [],
      };
    }

    // Find candidate domains to share from
    const candidates = await this.findSessionCandidates(targetDomain, opts);

    if (candidates.length === 0) {
      sharingLogger.debug('No session candidates found', { targetDomain });
      return null;
    }

    // Try each candidate until one works
    for (const candidate of candidates) {
      const result = await this.shareSession(candidate.domain, targetDomain, opts);
      if (result.success) {
        return result;
      }
    }

    return null;
  }

  /**
   * Share session from source domain to target domain
   */
  async shareSession(
    sourceDomain: string,
    targetDomain: string,
    options?: SessionSharingOptions
  ): Promise<SessionShareResult> {
    const opts = { ...this.defaultOptions, ...options };

    try {
      // Get the source session
      const sourceSession = this.sessionManager.getSession(
        sourceDomain,
        opts.sessionProfile
      );

      if (!sourceSession) {
        return {
          success: false,
          sourceDomain,
          targetDomain,
          error: 'Source session not found',
        };
      }

      // Check source session health
      const sourceHealth = await this.sessionManager.getSessionHealth(
        sourceDomain,
        opts.sessionProfile
      );

      if (sourceHealth.status === 'expired' || sourceHealth.status === 'not_found') {
        return {
          success: false,
          sourceDomain,
          targetDomain,
          error: 'Source session expired or invalid',
        };
      }

      // Get shared provider info
      const sharedProvider = this.correlator.findSharedProvider(sourceDomain, targetDomain);

      // Create target session with filtered/shared data
      const sharedItems: string[] = [];
      const targetSession: SessionStore = {
        domain: targetDomain,
        profile: opts.sessionProfile,
        cookies: [],
        localStorage: {},
        sessionStorage: {},
        lastUsed: Date.now(),
        isAuthenticated: sourceSession.isAuthenticated,
        createdAt: Date.now(),
        metadata: {
          sharedFrom: sourceDomain,
          sharedAt: Date.now(),
          providerId: sharedProvider?.providerId,
        },
      };

      // Share cookies (optionally filtered)
      if (sourceSession.cookies && sourceSession.cookies.length > 0) {
        if (opts.filterCookies) {
          // Only share IdP-related cookies
          targetSession.cookies = sourceSession.cookies.filter((cookie: { name: string; value: string }) => {
            const cookieStr = `${cookie.name}=${cookie.value}`;
            return IDP_COOKIE_PATTERNS.some(pattern => pattern.test(cookieStr));
          });
        } else {
          targetSession.cookies = [...sourceSession.cookies];
        }

        // Update cookie domains to target domain
        targetSession.cookies = targetSession.cookies.map((cookie: { domain?: string }) => ({
          ...cookie,
          domain: targetDomain.startsWith('.') ? targetDomain : `.${targetDomain}`,
        }));

        if (targetSession.cookies.length > 0) {
          sharedItems.push('cookies');
        }
      }

      // Share localStorage if enabled
      if (opts.shareLocalStorage && sourceSession.localStorage) {
        // Filter to IdP-related keys
        targetSession.localStorage = {};
        for (const [key, value] of Object.entries(sourceSession.localStorage)) {
          if (IDP_COOKIE_PATTERNS.some(pattern => pattern.test(key))) {
            targetSession.localStorage[key] = String(value);
          }
        }
        if (Object.keys(targetSession.localStorage).length > 0) {
          sharedItems.push('localStorage');
        }
      }

      // Share sessionStorage if enabled (usually not recommended)
      if (opts.shareSessionStorage && sourceSession.sessionStorage) {
        targetSession.sessionStorage = {};
        for (const [key, value] of Object.entries(sourceSession.sessionStorage)) {
          if (IDP_COOKIE_PATTERNS.some(pattern => pattern.test(key))) {
            targetSession.sessionStorage[key] = String(value);
          }
        }
        if (Object.keys(targetSession.sessionStorage).length > 0) {
          sharedItems.push('sessionStorage');
        }
      }

      // Only save if we actually have something to share
      if (sharedItems.length === 0) {
        return {
          success: false,
          sourceDomain,
          targetDomain,
          providerId: sharedProvider?.providerId,
          error: 'No shareable session data found',
        };
      }

      // Save the target session
      // Note: We need to use an internal method or the session data directly
      // since saveSession expects a BrowserContext
      await this.saveSharedSession(targetSession);

      sharingLogger.info('Session shared successfully', {
        sourceDomain,
        targetDomain,
        providerId: sharedProvider?.providerId,
        sharedItems,
      });

      return {
        success: true,
        sourceDomain,
        targetDomain,
        providerId: sharedProvider?.providerId,
        sharedItems,
        confidence: sharedProvider?.confidence,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      sharingLogger.error('Failed to share session', {
        sourceDomain,
        targetDomain,
        error: errorMessage,
      });

      return {
        success: false,
        sourceDomain,
        targetDomain,
        error: errorMessage,
      };
    }
  }

  /**
   * Save a shared session (internal method)
   * Uses the SessionManager's saveSessionData method
   */
  private async saveSharedSession(session: SessionStore): Promise<void> {
    await this.sessionManager.saveSessionData(session, session.profile);
  }

  /**
   * Get domain groups for debugging/inspection
   */
  getDomainGroups(minConfidence?: number): DomainGroup[] {
    return this.correlator.getDomainGroups(minConfidence ?? this.defaultOptions.minConfidence);
  }

  /**
   * Get related domains for a specific domain
   */
  getRelatedDomains(domain: string, minConfidence?: number): string[] {
    return this.correlator.getRelatedDomains(
      domain,
      minConfidence ?? this.defaultOptions.minConfidence
    );
  }

  /**
   * Export state for persistence
   */
  exportState(): CorrelatorState {
    return this.correlator.exportState();
  }

  /**
   * Import state from persistence
   */
  importState(state: CorrelatorState): void {
    this.correlator.importState(state);
  }

  /**
   * Apply confidence decay to old relationships
   */
  applyDecay(): number {
    return this.correlator.applyDecay();
  }

  /**
   * Get statistics about domain correlations
   */
  getStats() {
    return this.correlator.getStats();
  }

  /**
   * Clean up stale SSO flows
   */
  cleanupFlows(maxAgeMs?: number): number {
    return this.ssoDetector.cleanupFlows(maxAgeMs);
  }
}
