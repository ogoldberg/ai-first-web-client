/**
 * SSO Flow Detector (GAP-009)
 *
 * Detects Single Sign-On (SSO) flows during browsing operations:
 * - OAuth 2.0/OIDC flows (Google, GitHub, Microsoft, etc.)
 * - SAML 2.0 flows (enterprise SSO)
 * - Social login buttons and redirects
 *
 * The detector identifies the identity provider (IdP) involved in the SSO flow,
 * enabling cross-domain session correlation and reuse.
 */

import { logger } from '../utils/logger.js';

const ssoLogger = logger.create('SSOFlowDetector');

// ============================================
// TYPES
// ============================================

/**
 * Known identity provider information
 */
export interface IdentityProvider {
  id: string;
  name: string;
  type: 'oauth' | 'saml' | 'oidc';
  domains: string[];  // e.g., ['accounts.google.com', 'google.com']
  authEndpoints: RegExp[];  // URL patterns that indicate auth with this IdP
}

/**
 * Detected SSO flow information
 */
export interface SSOFlowInfo {
  /** Unique identifier for this SSO flow */
  flowId: string;
  /** The identity provider detected */
  provider: IdentityProvider;
  /** Type of SSO flow */
  flowType: 'oauth_authorize' | 'oauth_callback' | 'saml_request' | 'saml_response' | 'social_button';
  /** The original domain that initiated the SSO flow */
  initiatingDomain: string;
  /** The IdP domain handling authentication */
  idpDomain: string;
  /** The target domain after successful auth (redirect_uri for OAuth) */
  targetDomain?: string;
  /** OAuth-specific: client_id if detected */
  clientId?: string;
  /** OAuth-specific: scopes requested */
  scopes?: string[];
  /** SAML-specific: assertion consumer service URL */
  acsUrl?: string;
  /** When this flow was detected */
  detectedAt: number;
  /** URL that triggered detection */
  triggerUrl: string;
}

/**
 * Domain relationship learned from SSO flows
 */
export interface DomainSSORelationship {
  /** The relying party domain (site using SSO) */
  domain: string;
  /** The identity provider used */
  providerId: string;
  /** OAuth client ID for this domain (if applicable) */
  clientId?: string;
  /** Confidence in this relationship (0-1) */
  confidence: number;
  /** Number of times this relationship was observed */
  observationCount: number;
  /** Last time this relationship was observed */
  lastObserved: number;
  /** First time this relationship was observed */
  firstObserved: number;
}

/**
 * Options for SSO flow detection
 */
export interface SSODetectorOptions {
  /** Enable detection from URL analysis */
  detectFromUrls?: boolean;
  /** Enable detection from page content (social login buttons) */
  detectFromContent?: boolean;
  /** Enable detection from network requests */
  detectFromNetwork?: boolean;
}

// ============================================
// KNOWN IDENTITY PROVIDERS
// ============================================

/**
 * Well-known identity providers with their auth patterns
 */
export const KNOWN_PROVIDERS: IdentityProvider[] = [
  {
    id: 'google',
    name: 'Google',
    type: 'oidc',
    domains: ['accounts.google.com', 'google.com', 'googleapis.com'],
    authEndpoints: [
      /accounts\.google\.com\/o\/oauth2/i,
      /accounts\.google\.com\/signin\/oauth/i,
      /accounts\.google\.com\/ServiceLogin/i,
    ],
  },
  {
    id: 'github',
    name: 'GitHub',
    type: 'oauth',
    domains: ['github.com'],
    authEndpoints: [
      /github\.com\/login\/oauth\/authorize/i,
      /github\.com\/login\/oauth\/access_token/i,
    ],
  },
  {
    id: 'microsoft',
    name: 'Microsoft',
    type: 'oidc',
    domains: ['login.microsoftonline.com', 'login.live.com', 'microsoft.com'],
    authEndpoints: [
      /login\.microsoftonline\.com\/.*\/oauth2/i,
      /login\.live\.com\/oauth20/i,
    ],
  },
  {
    id: 'facebook',
    name: 'Facebook',
    type: 'oauth',
    domains: ['facebook.com', 'fb.com'],
    authEndpoints: [
      /facebook\.com\/v\d+\.\d+\/dialog\/oauth/i,
      /facebook\.com\/dialog\/oauth/i,
    ],
  },
  {
    id: 'apple',
    name: 'Apple',
    type: 'oidc',
    domains: ['appleid.apple.com'],
    authEndpoints: [
      /appleid\.apple\.com\/auth\/authorize/i,
    ],
  },
  {
    id: 'twitter',
    name: 'Twitter/X',
    type: 'oauth',
    domains: ['twitter.com', 'x.com', 'api.twitter.com'],
    authEndpoints: [
      /api\.twitter\.com\/oauth/i,
      /twitter\.com\/i\/oauth2/i,
    ],
  },
  {
    id: 'linkedin',
    name: 'LinkedIn',
    type: 'oauth',
    domains: ['linkedin.com', 'www.linkedin.com'],
    authEndpoints: [
      /linkedin\.com\/oauth/i,
      /linkedin\.com\/uas\/oauth2/i,
    ],
  },
  {
    id: 'okta',
    name: 'Okta',
    type: 'oidc',
    domains: [], // Dynamic - matches *.okta.com
    authEndpoints: [
      /\.okta\.com\/oauth2/i,
      /\.okta\.com\/login\/login\.htm/i,
    ],
  },
  {
    id: 'auth0',
    name: 'Auth0',
    type: 'oidc',
    domains: [], // Dynamic - matches *.auth0.com
    authEndpoints: [
      /\.auth0\.com\/authorize/i,
      /\.auth0\.com\/login/i,
    ],
  },
  {
    id: 'aws_cognito',
    name: 'AWS Cognito',
    type: 'oidc',
    domains: [], // Dynamic - matches *.amazoncognito.com
    authEndpoints: [
      /\.amazoncognito\.com\/oauth2/i,
      /\.auth\..*\.amazoncognito\.com/i,
    ],
  },
];

// ============================================
// SAML DETECTION PATTERNS
// ============================================

const SAML_REQUEST_PATTERNS = [
  /SAMLRequest=/i,
  /\/saml\/sso/i,
  /\/saml2\/sso/i,
  /\/adfs\/ls/i,
  /\/simplesaml\//i,
];

const SAML_RESPONSE_PATTERNS = [
  /SAMLResponse=/i,
  /RelayState=/i,
];

// ============================================
// SOCIAL LOGIN BUTTON PATTERNS
// ============================================

const SOCIAL_LOGIN_PATTERNS = [
  { provider: 'google', patterns: [/sign\s*in\s*with\s*google/i, /continue\s*with\s*google/i, /login\s*with\s*google/i] },
  { provider: 'github', patterns: [/sign\s*in\s*with\s*github/i, /continue\s*with\s*github/i, /login\s*with\s*github/i] },
  { provider: 'microsoft', patterns: [/sign\s*in\s*with\s*microsoft/i, /continue\s*with\s*microsoft/i] },
  { provider: 'facebook', patterns: [/sign\s*in\s*with\s*facebook/i, /continue\s*with\s*facebook/i, /login\s*with\s*facebook/i] },
  { provider: 'apple', patterns: [/sign\s*in\s*with\s*apple/i, /continue\s*with\s*apple/i] },
  { provider: 'twitter', patterns: [/sign\s*in\s*with\s*twitter/i, /sign\s*in\s*with\s*x/i] },
  { provider: 'linkedin', patterns: [/sign\s*in\s*with\s*linkedin/i, /continue\s*with\s*linkedin/i] },
];

// ============================================
// SSO FLOW DETECTOR CLASS
// ============================================

export class SSOFlowDetector {
  private providers: Map<string, IdentityProvider> = new Map();
  private activeFlows: Map<string, SSOFlowInfo> = new Map();
  private options: Required<SSODetectorOptions>;

  constructor(options: SSODetectorOptions = {}) {
    this.options = {
      detectFromUrls: options.detectFromUrls ?? true,
      detectFromContent: options.detectFromContent ?? true,
      detectFromNetwork: options.detectFromNetwork ?? true,
    };

    // Initialize known providers
    for (const provider of KNOWN_PROVIDERS) {
      this.providers.set(provider.id, provider);
    }
  }

  /**
   * Detect SSO flow from a URL (navigation or redirect)
   */
  detectFromUrl(url: string, initiatingDomain?: string): SSOFlowInfo | null {
    if (!this.options.detectFromUrls) return null;

    try {
      const parsedUrl = new URL(url);
      const currentDomain = parsedUrl.hostname;

      // Check OAuth authorization endpoints
      const oauthFlow = this.detectOAuthFromUrl(url, parsedUrl, initiatingDomain || currentDomain);
      if (oauthFlow) return oauthFlow;

      // Check SAML flows
      const samlFlow = this.detectSAMLFromUrl(url, parsedUrl, initiatingDomain || currentDomain);
      if (samlFlow) return samlFlow;

      return null;
    } catch (error) {
      ssoLogger.debug('Failed to parse URL for SSO detection', { url, error });
      return null;
    }
  }

  /**
   * Detect OAuth flow from URL
   */
  private detectOAuthFromUrl(url: string, parsedUrl: URL, initiatingDomain: string): SSOFlowInfo | null {
    const currentDomain = parsedUrl.hostname;

    // Check against known providers
    for (const provider of this.providers.values()) {
      for (const pattern of provider.authEndpoints) {
        if (pattern.test(url)) {
          const params = parsedUrl.searchParams;
          const clientId = params.get('client_id') || undefined;
          const redirectUri = params.get('redirect_uri');
          const scope = params.get('scope');
          const responseType = params.get('response_type');

          // Determine if this is an authorize or callback
          const isCallback = params.has('code') || params.has('access_token') || params.has('error');
          const flowType = isCallback ? 'oauth_callback' : 'oauth_authorize';

          const targetDomain = redirectUri ? this.extractDomain(redirectUri) : undefined;

          const flowInfo: SSOFlowInfo = {
            flowId: this.generateFlowId(),
            provider,
            flowType,
            initiatingDomain,
            idpDomain: currentDomain,
            targetDomain,
            clientId,
            scopes: scope ? scope.split(/[\s,]+/) : undefined,
            detectedAt: Date.now(),
            triggerUrl: url,
          };

          ssoLogger.info('Detected OAuth flow', {
            provider: provider.name,
            flowType,
            initiatingDomain,
            targetDomain,
          });

          this.activeFlows.set(flowInfo.flowId, flowInfo);
          return flowInfo;
        }
      }
    }

    // Check for generic OAuth patterns (unknown IdPs)
    if (this.isGenericOAuthUrl(url, parsedUrl)) {
      const params = parsedUrl.searchParams;
      const genericProvider: IdentityProvider = {
        id: `unknown_${currentDomain.replace(/\./g, '_')}`,
        name: currentDomain,
        type: 'oauth',
        domains: [currentDomain],
        authEndpoints: [],
      };

      const isCallback = params.has('code') || params.has('access_token');
      const redirectUri = params.get('redirect_uri');
      const targetDomain = redirectUri ? this.extractDomain(redirectUri) : undefined;

      const flowInfo: SSOFlowInfo = {
        flowId: this.generateFlowId(),
        provider: genericProvider,
        flowType: isCallback ? 'oauth_callback' : 'oauth_authorize',
        initiatingDomain,
        idpDomain: currentDomain,
        targetDomain,
        clientId: params.get('client_id') || undefined,
        scopes: params.get('scope')?.split(/[\s,]+/),
        detectedAt: Date.now(),
        triggerUrl: url,
      };

      ssoLogger.info('Detected generic OAuth flow', {
        idpDomain: currentDomain,
        flowType: flowInfo.flowType,
      });

      this.activeFlows.set(flowInfo.flowId, flowInfo);
      return flowInfo;
    }

    return null;
  }

  /**
   * Check if URL looks like a generic OAuth endpoint
   */
  private isGenericOAuthUrl(url: string, parsedUrl: URL): boolean {
    const params = parsedUrl.searchParams;
    const path = parsedUrl.pathname.toLowerCase();

    // Must have OAuth-like parameters
    const hasOAuthParams = params.has('client_id') || params.has('code') || params.has('access_token');

    // Must have OAuth-like path
    const hasOAuthPath = /\/oauth|\/authorize|\/auth|\/login\/callback/i.test(path);

    return hasOAuthParams && hasOAuthPath;
  }

  /**
   * Detect SAML flow from URL
   */
  private detectSAMLFromUrl(url: string, parsedUrl: URL, initiatingDomain: string): SSOFlowInfo | null {
    const currentDomain = parsedUrl.hostname;
    const fullUrl = url + (parsedUrl.search || '');

    // Check for SAML request
    for (const pattern of SAML_REQUEST_PATTERNS) {
      if (pattern.test(fullUrl)) {
        const flowInfo: SSOFlowInfo = {
          flowId: this.generateFlowId(),
          provider: this.createSAMLProvider(currentDomain),
          flowType: 'saml_request',
          initiatingDomain,
          idpDomain: currentDomain,
          detectedAt: Date.now(),
          triggerUrl: url,
        };

        ssoLogger.info('Detected SAML request', { idpDomain: currentDomain });
        this.activeFlows.set(flowInfo.flowId, flowInfo);
        return flowInfo;
      }
    }

    // Check for SAML response
    for (const pattern of SAML_RESPONSE_PATTERNS) {
      if (pattern.test(fullUrl)) {
        const flowInfo: SSOFlowInfo = {
          flowId: this.generateFlowId(),
          provider: this.createSAMLProvider(currentDomain),
          flowType: 'saml_response',
          initiatingDomain,
          idpDomain: currentDomain,
          acsUrl: url.split('?')[0],
          detectedAt: Date.now(),
          triggerUrl: url,
        };

        ssoLogger.info('Detected SAML response', { acsUrl: flowInfo.acsUrl });
        this.activeFlows.set(flowInfo.flowId, flowInfo);
        return flowInfo;
      }
    }

    return null;
  }

  /**
   * Detect social login buttons from page HTML content
   */
  detectFromContent(html: string, currentDomain: string): SSOFlowInfo[] {
    if (!this.options.detectFromContent) return [];

    const detectedFlows: SSOFlowInfo[] = [];

    for (const { provider: providerId, patterns } of SOCIAL_LOGIN_PATTERNS) {
      for (const pattern of patterns) {
        if (pattern.test(html)) {
          const provider = this.providers.get(providerId);
          if (provider) {
            const flowInfo: SSOFlowInfo = {
              flowId: this.generateFlowId(),
              provider,
              flowType: 'social_button',
              initiatingDomain: currentDomain,
              idpDomain: provider.domains[0] || 'unknown',
              detectedAt: Date.now(),
              triggerUrl: currentDomain,
            };

            detectedFlows.push(flowInfo);
            ssoLogger.debug('Detected social login button', {
              provider: provider.name,
              domain: currentDomain,
            });
            break; // Only detect once per provider
          }
        }
      }
    }

    return detectedFlows;
  }

  /**
   * Get the identity provider for a domain
   */
  getProviderForDomain(domain: string): IdentityProvider | null {
    for (const provider of this.providers.values()) {
      if (provider.domains.includes(domain)) {
        return provider;
      }

      // Check for dynamic IdPs (Okta, Auth0, Cognito)
      if (provider.id === 'okta' && domain.endsWith('.okta.com')) {
        return provider;
      }
      if (provider.id === 'auth0' && domain.endsWith('.auth0.com')) {
        return provider;
      }
      if (provider.id === 'aws_cognito' && domain.includes('.amazoncognito.com')) {
        return provider;
      }
    }

    return null;
  }

  /**
   * Register a custom identity provider
   */
  registerProvider(provider: IdentityProvider): void {
    this.providers.set(provider.id, provider);
    ssoLogger.info('Registered custom provider', { id: provider.id, name: provider.name });
  }

  /**
   * Get all active SSO flows
   */
  getActiveFlows(): SSOFlowInfo[] {
    return Array.from(this.activeFlows.values());
  }

  /**
   * Get a specific flow by ID
   */
  getFlow(flowId: string): SSOFlowInfo | undefined {
    return this.activeFlows.get(flowId);
  }

  /**
   * Clear completed/stale flows older than the given threshold
   */
  cleanupFlows(maxAgeMs: number = 30 * 60 * 1000): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [flowId, flow] of this.activeFlows.entries()) {
      if (now - flow.detectedAt >= maxAgeMs) {
        this.activeFlows.delete(flowId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      ssoLogger.debug('Cleaned up stale SSO flows', { count: cleaned });
    }

    return cleaned;
  }

  // ============================================
  // HELPER METHODS
  // ============================================

  private generateFlowId(): string {
    return `sso_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  }

  private extractDomain(url: string): string | undefined {
    try {
      return new URL(url).hostname;
    } catch {
      return undefined;
    }
  }

  private createSAMLProvider(idpDomain: string): IdentityProvider {
    return {
      id: `saml_${idpDomain.replace(/\./g, '_')}`,
      name: `SAML IdP (${idpDomain})`,
      type: 'saml',
      domains: [idpDomain],
      authEndpoints: [],
    };
  }
}
