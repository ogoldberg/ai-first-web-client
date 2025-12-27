/**
 * Tests for Session Sharing (GAP-009)
 *
 * Tests cover:
 * - SSO flow detection (OAuth, SAML, social login)
 * - Domain correlation and relationship learning
 * - Cross-domain session sharing
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SSOFlowDetector, KNOWN_PROVIDERS } from '../../src/core/sso-flow-detector.js';
import { DomainCorrelator } from '../../src/core/domain-correlator.js';

// ============================================
// SSO FLOW DETECTOR TESTS
// ============================================

describe('SSOFlowDetector', () => {
  let detector: SSOFlowDetector;

  beforeEach(() => {
    detector = new SSOFlowDetector();
  });

  describe('OAuth Detection', () => {
    it('should detect Google OAuth authorization URL', () => {
      const url = 'https://accounts.google.com/o/oauth2/auth?client_id=abc123&redirect_uri=https://myapp.com/callback&scope=email profile&response_type=code';
      const flow = detector.detectFromUrl(url, 'myapp.com');

      expect(flow).not.toBeNull();
      expect(flow!.provider.id).toBe('google');
      expect(flow!.flowType).toBe('oauth_authorize');
      expect(flow!.clientId).toBe('abc123');
      expect(flow!.scopes).toContain('email');
      expect(flow!.scopes).toContain('profile');
    });

    it('should detect GitHub OAuth authorization URL', () => {
      const url = 'https://github.com/login/oauth/authorize?client_id=def456&redirect_uri=https://myapp.com/callback&scope=user:email';
      const flow = detector.detectFromUrl(url, 'myapp.com');

      expect(flow).not.toBeNull();
      expect(flow!.provider.id).toBe('github');
      expect(flow!.flowType).toBe('oauth_authorize');
      expect(flow!.clientId).toBe('def456');
    });

    it('should detect Microsoft OAuth URL', () => {
      const url = 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=xyz789&redirect_uri=https://myapp.com/callback&scope=openid';
      const flow = detector.detectFromUrl(url, 'myapp.com');

      expect(flow).not.toBeNull();
      expect(flow!.provider.id).toBe('microsoft');
      expect(flow!.flowType).toBe('oauth_authorize');
    });

    it('should detect OAuth callback with code', () => {
      const url = 'https://accounts.google.com/o/oauth2/auth?code=abc123&state=xyz';
      const flow = detector.detectFromUrl(url, 'myapp.com');

      expect(flow).not.toBeNull();
      expect(flow!.flowType).toBe('oauth_callback');
    });

    it('should detect generic OAuth URLs', () => {
      const url = 'https://custom-idp.example.com/oauth/authorize?client_id=custom123&redirect_uri=https://myapp.com/callback&response_type=code';
      const flow = detector.detectFromUrl(url, 'myapp.com');

      expect(flow).not.toBeNull();
      expect(flow!.flowType).toBe('oauth_authorize');
      expect(flow!.idpDomain).toBe('custom-idp.example.com');
    });

    it('should extract target domain from redirect_uri', () => {
      const url = 'https://accounts.google.com/o/oauth2/auth?client_id=abc&redirect_uri=https://targetapp.com/callback&scope=email';
      const flow = detector.detectFromUrl(url, 'sourceapp.com');

      expect(flow).not.toBeNull();
      expect(flow!.targetDomain).toBe('targetapp.com');
    });
  });

  describe('SAML Detection', () => {
    it('should detect SAML request in URL', () => {
      const url = 'https://idp.example.com/saml/sso?SAMLRequest=base64encodedrequest';
      const flow = detector.detectFromUrl(url, 'myapp.com');

      expect(flow).not.toBeNull();
      expect(flow!.flowType).toBe('saml_request');
      expect(flow!.provider.type).toBe('saml');
    });

    it('should detect SAML response in URL', () => {
      const url = 'https://myapp.com/acs?SAMLResponse=base64encodedresponse&RelayState=xyz';
      const flow = detector.detectFromUrl(url, 'myapp.com');

      expect(flow).not.toBeNull();
      expect(flow!.flowType).toBe('saml_response');
    });

    it('should detect ADFS URLs', () => {
      const url = 'https://adfs.company.com/adfs/ls?wa=wsignin1.0&SAMLRequest=abc';
      const flow = detector.detectFromUrl(url, 'myapp.com');

      expect(flow).not.toBeNull();
      expect(flow!.flowType).toBe('saml_request');
    });
  });

  describe('Social Login Detection', () => {
    it('should detect Google social login button in HTML', () => {
      const html = '<button class="social-btn">Sign in with Google</button>';
      const flows = detector.detectFromContent(html, 'myapp.com');

      expect(flows.length).toBeGreaterThan(0);
      expect(flows.some(f => f.provider.id === 'google')).toBe(true);
      expect(flows.find(f => f.provider.id === 'google')!.flowType).toBe('social_button');
    });

    it('should detect multiple social login buttons', () => {
      const html = `
        <div class="social-logins">
          <button>Continue with Google</button>
          <button>Sign in with GitHub</button>
          <button>Login with Facebook</button>
        </div>
      `;
      const flows = detector.detectFromContent(html, 'myapp.com');

      expect(flows.length).toBeGreaterThanOrEqual(3);
      expect(flows.some(f => f.provider.id === 'google')).toBe(true);
      expect(flows.some(f => f.provider.id === 'github')).toBe(true);
      expect(flows.some(f => f.provider.id === 'facebook')).toBe(true);
    });
  });

  describe('Provider Management', () => {
    it('should have known providers', () => {
      expect(KNOWN_PROVIDERS.length).toBeGreaterThan(0);
      expect(KNOWN_PROVIDERS.some(p => p.id === 'google')).toBe(true);
      expect(KNOWN_PROVIDERS.some(p => p.id === 'github')).toBe(true);
    });

    it('should get provider for known domains', () => {
      const googleProvider = detector.getProviderForDomain('accounts.google.com');
      expect(googleProvider).not.toBeNull();
      expect(googleProvider!.id).toBe('google');
    });

    it('should detect Okta domains dynamically', () => {
      const oktaProvider = detector.getProviderForDomain('mycompany.okta.com');
      expect(oktaProvider).not.toBeNull();
      expect(oktaProvider!.id).toBe('okta');
    });

    it('should detect Auth0 domains dynamically', () => {
      const auth0Provider = detector.getProviderForDomain('myapp.auth0.com');
      expect(auth0Provider).not.toBeNull();
      expect(auth0Provider!.id).toBe('auth0');
    });

    it('should allow registering custom providers', () => {
      detector.registerProvider({
        id: 'custom',
        name: 'Custom IdP',
        type: 'oidc',
        domains: ['auth.custom.com'],
        authEndpoints: [/auth\.custom\.com\/oauth/i],
      });

      const customProvider = detector.getProviderForDomain('auth.custom.com');
      expect(customProvider).not.toBeNull();
      expect(customProvider!.id).toBe('custom');
    });
  });

  describe('Flow Management', () => {
    it('should track active flows', () => {
      const url = 'https://accounts.google.com/o/oauth2/auth?client_id=abc&redirect_uri=https://myapp.com/callback';
      detector.detectFromUrl(url, 'myapp.com');

      const activeFlows = detector.getActiveFlows();
      expect(activeFlows.length).toBe(1);
    });

    it('should cleanup stale flows', () => {
      // Manually add old flows by detecting and then modifying timestamps
      const url = 'https://accounts.google.com/o/oauth2/auth?client_id=abc&redirect_uri=https://myapp.com/callback';
      const flow = detector.detectFromUrl(url, 'myapp.com');

      // The flow is just created, so cleanup with 0 maxAge should clean it
      const cleaned = detector.cleanupFlows(0);
      expect(cleaned).toBe(1);
      expect(detector.getActiveFlows().length).toBe(0);
    });
  });
});

// ============================================
// DOMAIN CORRELATOR TESTS
// ============================================

describe('DomainCorrelator', () => {
  let correlator: DomainCorrelator;

  beforeEach(() => {
    correlator = new DomainCorrelator();
  });

  describe('Learning Relationships', () => {
    it('should learn from SSO flows', () => {
      const mockFlow = {
        flowId: 'test_1',
        provider: { id: 'google', name: 'Google', type: 'oidc' as const, domains: ['accounts.google.com'], authEndpoints: [] },
        flowType: 'oauth_authorize' as const,
        initiatingDomain: 'app1.com',
        idpDomain: 'accounts.google.com',
        targetDomain: 'app1.com',
        clientId: 'abc123',
        detectedAt: Date.now(),
        triggerUrl: 'https://accounts.google.com/o/oauth2/auth',
      };

      const relationship = correlator.learnFromFlow(mockFlow);

      expect(relationship.domain).toBe('app1.com');
      expect(relationship.providerId).toBe('google');
      expect(relationship.clientId).toBe('abc123');
      expect(relationship.confidence).toBeGreaterThan(0.5);
    });

    it('should increase confidence with repeated observations', () => {
      const mockFlow = {
        flowId: 'test_1',
        provider: { id: 'google', name: 'Google', type: 'oidc' as const, domains: ['accounts.google.com'], authEndpoints: [] },
        flowType: 'oauth_authorize' as const,
        initiatingDomain: 'app1.com',
        idpDomain: 'accounts.google.com',
        detectedAt: Date.now(),
        triggerUrl: 'https://accounts.google.com/o/oauth2/auth',
      };

      const rel1 = correlator.learnFromFlow(mockFlow);
      const initialConfidence = rel1.confidence;

      mockFlow.flowId = 'test_2';
      const rel2 = correlator.learnFromFlow(mockFlow);

      expect(rel2.confidence).toBeGreaterThan(initialConfidence);
      expect(rel2.observationCount).toBe(2);
    });
  });

  describe('Finding Related Domains', () => {
    beforeEach(() => {
      // Learn some relationships
      correlator.learnRelationship('app1.com', 'google', 'client1');
      correlator.learnRelationship('app2.com', 'google', 'client2');
      correlator.learnRelationship('app3.com', 'github', 'client3');
    });

    it('should find domains with shared provider', () => {
      const relatedToApp1 = correlator.getRelatedDomains('app1.com');

      expect(relatedToApp1).toContain('app2.com');
      expect(relatedToApp1).not.toContain('app3.com');
    });

    it('should respect minimum confidence threshold', () => {
      // With high threshold, no related domains (initial confidence is 0.5)
      const highThreshold = correlator.getRelatedDomains('app1.com', 0.9);
      expect(highThreshold.length).toBe(0);
    });

    it('should find shared provider between domains', () => {
      const shared = correlator.findSharedProvider('app1.com', 'app2.com');

      expect(shared).not.toBeNull();
      expect(shared!.providerId).toBe('google');
    });

    it('should return null when no shared provider', () => {
      const noShared = correlator.findSharedProvider('app1.com', 'app3.com');
      expect(noShared).toBeNull();
    });
  });

  describe('Domain Groups', () => {
    beforeEach(() => {
      correlator.learnRelationship('app1.com', 'google');
      correlator.learnRelationship('app2.com', 'google');
      correlator.learnRelationship('app3.com', 'google');
      correlator.learnRelationship('app4.com', 'github');
      correlator.learnRelationship('app5.com', 'github');
    });

    it('should organize domains into groups by provider', () => {
      const groups = correlator.getDomainGroups();

      expect(groups.length).toBe(2);

      const googleGroup = groups.find(g => g.providerId === 'google');
      const githubGroup = groups.find(g => g.providerId === 'github');

      expect(googleGroup).toBeDefined();
      expect(googleGroup!.domains.length).toBe(3);

      expect(githubGroup).toBeDefined();
      expect(githubGroup!.domains.length).toBe(2);
    });

    it('should sort groups by size', () => {
      const groups = correlator.getDomainGroups();

      expect(groups[0].domains.length).toBeGreaterThanOrEqual(groups[1].domains.length);
    });
  });

  describe('Provider Queries', () => {
    beforeEach(() => {
      correlator.learnRelationship('app1.com', 'google');
      correlator.learnRelationship('app1.com', 'github');
    });

    it('should get providers for a domain', () => {
      const providers = correlator.getProvidersForDomain('app1.com');

      expect(providers.length).toBe(2);
      expect(providers.some(p => p.providerId === 'google')).toBe(true);
      expect(providers.some(p => p.providerId === 'github')).toBe(true);
    });

    it('should get domains for a provider', () => {
      correlator.learnRelationship('app2.com', 'google');

      const googleDomains = correlator.getDomainsForProvider('google');
      expect(googleDomains).toContain('app1.com');
      expect(googleDomains).toContain('app2.com');
    });
  });

  describe('State Persistence', () => {
    beforeEach(() => {
      correlator.learnRelationship('app1.com', 'google', 'client1');
      correlator.learnRelationship('app2.com', 'github', 'client2');
    });

    it('should export and import state', () => {
      const state = correlator.exportState();

      expect(state.version).toBe(1);
      expect(state.relationships.length).toBe(2);

      // Create new correlator and import
      const newCorrelator = new DomainCorrelator();
      newCorrelator.importState(state);

      const relatedDomains = newCorrelator.getRelatedDomains('app1.com');
      // app1 and app2 use different providers, so no related domains
      expect(relatedDomains.length).toBe(0);

      // But providers should be preserved
      const providers = newCorrelator.getProvidersForDomain('app1.com');
      expect(providers.length).toBe(1);
      expect(providers[0].providerId).toBe('google');
    });

    it('should handle version mismatch gracefully', () => {
      const badState = {
        version: 999, // Wrong version
        relationships: [],
        lastUpdated: Date.now(),
      };

      // Should not throw
      const newCorrelator = new DomainCorrelator();
      newCorrelator.importState(badState);

      // Should be empty after failed import
      expect(newCorrelator.getStats().totalRelationships).toBe(0);
    });
  });

  describe('Statistics', () => {
    it('should provide accurate statistics', () => {
      correlator.learnRelationship('app1.com', 'google');
      correlator.learnRelationship('app2.com', 'google');
      correlator.learnRelationship('app3.com', 'github');

      const stats = correlator.getStats();

      expect(stats.totalRelationships).toBe(3);
      expect(stats.totalProviders).toBe(2);
      expect(stats.totalDomains).toBe(3);
      expect(stats.largestGroup).toBe(2); // Google group
    });
  });

  describe('Confidence Decay', () => {
    it('should apply decay to old relationships', () => {
      correlator.learnRelationship('app1.com', 'google');

      // Decay won't affect fresh relationships
      const decayed = correlator.applyDecay();
      expect(decayed).toBe(0);

      // Stats should still show the relationship
      expect(correlator.getStats().totalRelationships).toBe(1);
    });
  });
});

// ============================================
// SESSION SHARING SERVICE TESTS
// ============================================

import { SessionSharingService } from '../../src/core/session-sharing.js';
import type { SessionStore } from '../../src/types/index.js';
import type { SessionHealth } from '../../src/core/session-manager.js';

// Mock SessionManager for testing
class MockSessionManager {
  private sessions: Map<string, SessionStore> = new Map();

  getSession(domain: string, profile: string = 'default'): SessionStore | undefined {
    return this.sessions.get(`${domain}:${profile}`);
  }

  hasSession(domain: string, profile: string = 'default'): boolean {
    return this.sessions.has(`${domain}:${profile}`);
  }

  getSessionHealth(domain: string, profile: string = 'default'): SessionHealth {
    const session = this.getSession(domain, profile);
    if (!session) {
      return {
        status: 'not_found',
        domain,
        profile,
        isAuthenticated: false,
        expiredCookies: 0,
        totalCookies: 0,
        lastUsed: 0,
        staleDays: 0,
        message: 'Session not found',
      };
    }
    return {
      status: 'healthy',
      domain,
      profile,
      isAuthenticated: session.isAuthenticated,
      expiredCookies: 0,
      totalCookies: session.cookies.length,
      lastUsed: session.lastUsed,
      staleDays: 0,
      message: 'Session is healthy',
    };
  }

  async saveSessionData(session: SessionStore, profile: string = 'default'): Promise<void> {
    this.sessions.set(`${session.domain}:${profile}`, session);
  }

  // Helper for setting up test sessions
  setSession(session: SessionStore, profile: string = 'default'): void {
    this.sessions.set(`${session.domain}:${profile}`, session);
  }

  getAllSessions(): Map<string, SessionStore> {
    return this.sessions;
  }
}

describe('SessionSharingService', () => {
  let mockSessionManager: MockSessionManager;
  let sharingService: SessionSharingService;

  beforeEach(() => {
    mockSessionManager = new MockSessionManager();
    sharingService = new SessionSharingService(mockSessionManager as any);
  });

  describe('processUrl', () => {
    it('should detect SSO flow and learn domain relationships', () => {
      const flow = sharingService.processUrl(
        'https://accounts.google.com/o/oauth2/auth?client_id=abc&redirect_uri=https://myapp.com/callback',
        'myapp.com'
      );

      expect(flow).not.toBeNull();
      expect(flow!.provider.id).toBe('google');
    });

    it('should return null for non-SSO URLs', () => {
      const flow = sharingService.processUrl(
        'https://example.com/regular-page',
        'example.com'
      );

      expect(flow).toBeNull();
    });
  });

  describe('findSessionCandidates', () => {
    it('should find candidates from related domains with sessions', async () => {
      // Set up a session on source domain
      mockSessionManager.setSession({
        domain: 'app1.com',
        cookies: [{ name: 'auth_token', value: 'abc123' }],
        localStorage: {},
        sessionStorage: {},
        isAuthenticated: true,
        lastUsed: Date.now(),
      });

      // Learn that both domains use Google SSO
      sharingService.processUrl(
        'https://accounts.google.com/o/oauth2/auth?client_id=a&redirect_uri=https://app1.com/cb',
        'app1.com'
      );
      sharingService.processUrl(
        'https://accounts.google.com/o/oauth2/auth?client_id=b&redirect_uri=https://app2.com/cb',
        'app2.com'
      );

      const candidates = await sharingService.findSessionCandidates('app2.com');

      expect(candidates.length).toBe(1);
      expect(candidates[0].domain).toBe('app1.com');
      expect(candidates[0].providerId).toBe('google');
    });

    it('should return empty array when no candidates exist', async () => {
      const candidates = await sharingService.findSessionCandidates('unknown.com');
      expect(candidates.length).toBe(0);
    });
  });

  describe('shareSession', () => {
    it('should share session from source to target domain', async () => {
      // Set up source session with auth cookies
      mockSessionManager.setSession({
        domain: 'source.com',
        cookies: [
          { name: 'session_id', value: 'sess123', domain: '.source.com' },
          { name: 'auth_token', value: 'token456', domain: '.source.com' },
          { name: 'tracking', value: 'track789', domain: '.source.com' }, // Should be filtered
        ],
        localStorage: { 'auth_state': 'authenticated' },
        sessionStorage: {},
        isAuthenticated: true,
        lastUsed: Date.now(),
      });

      // Learn domain relationship
      sharingService.processUrl(
        'https://accounts.google.com/o/oauth2/auth?client_id=a&redirect_uri=https://source.com/cb',
        'source.com'
      );
      sharingService.processUrl(
        'https://accounts.google.com/o/oauth2/auth?client_id=b&redirect_uri=https://target.com/cb',
        'target.com'
      );

      const result = await sharingService.shareSession('source.com', 'target.com');

      expect(result.success).toBe(true);
      expect(result.sourceDomain).toBe('source.com');
      expect(result.targetDomain).toBe('target.com');
      expect(result.sharedItems).toContain('cookies');
      expect(result.sharedItems).toContain('localStorage');

      // Verify target session was created
      const targetSession = mockSessionManager.getSession('target.com');
      expect(targetSession).toBeDefined();
      expect(targetSession!.isAuthenticated).toBe(true);
      // Auth cookies should be shared
      expect(targetSession!.cookies.some((c: any) => c.name === 'session_id')).toBe(true);
      expect(targetSession!.cookies.some((c: any) => c.name === 'auth_token')).toBe(true);
      // Tracking cookie should be filtered out (doesn't match IdP patterns)
      expect(targetSession!.cookies.some((c: any) => c.name === 'tracking')).toBe(false);
    });

    it('should fail when source session does not exist', async () => {
      const result = await sharingService.shareSession('nonexistent.com', 'target.com');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Source session not found');
    });

    it('should fail when source session is expired', async () => {
      // Set up an expired session
      mockSessionManager.setSession({
        domain: 'expired.com',
        cookies: [],
        localStorage: {},
        sessionStorage: {},
        isAuthenticated: false,
        lastUsed: Date.now() - 100 * 24 * 60 * 60 * 1000, // 100 days ago
      });

      // Override getSessionHealth to return expired
      (mockSessionManager as any).getSessionHealth = () => ({
        status: 'expired',
        domain: 'expired.com',
        profile: 'default',
        isAuthenticated: false,
        expiredCookies: 5,
        totalCookies: 5,
        lastUsed: Date.now() - 100 * 24 * 60 * 60 * 1000,
        staleDays: 100,
        message: 'Session expired',
      });

      const result = await sharingService.shareSession('expired.com', 'target.com');

      expect(result.success).toBe(false);
      expect(result.error).toContain('expired');
    });

    it('should respect filterCookies option', async () => {
      mockSessionManager.setSession({
        domain: 'source.com',
        cookies: [
          { name: 'random_cookie', value: 'value1', domain: '.source.com' },
        ],
        localStorage: {},
        sessionStorage: {},
        isAuthenticated: true,
        lastUsed: Date.now(),
      });

      // Without filter, all cookies shared
      const resultNoFilter = await sharingService.shareSession('source.com', 'target1.com', {
        filterCookies: false,
      });

      // With random cookie and no IdP relationship, sharing might fail or succeed with unfiltered
      // The key is that filterCookies: false doesn't apply IdP patterns
      expect(resultNoFilter.success).toBe(true);
      const target1Session = mockSessionManager.getSession('target1.com');
      expect(target1Session!.cookies.length).toBe(1);
    });
  });

  describe('getOrShareSession', () => {
    it('should return success with no shared items if target already has valid session', async () => {
      mockSessionManager.setSession({
        domain: 'target.com',
        cookies: [{ name: 'existing', value: 'session' }],
        localStorage: {},
        sessionStorage: {},
        isAuthenticated: true,
        lastUsed: Date.now(),
      });

      const result = await sharingService.getOrShareSession('target.com');

      // Should return success with no sharing needed
      expect(result).not.toBeNull();
      expect(result!.success).toBe(true);
      expect(result!.sourceDomain).toBe('target.com'); // Points to itself
      expect(result!.sharedItems).toEqual([]); // Nothing was shared
    });

    it('should share session from best candidate when no session exists', async () => {
      // Set up source with session
      mockSessionManager.setSession({
        domain: 'source.com',
        cookies: [{ name: 'auth_token', value: 'abc' }],
        localStorage: {},
        sessionStorage: {},
        isAuthenticated: true,
        lastUsed: Date.now(),
      });

      // Learn relationship
      sharingService.processUrl(
        'https://accounts.google.com/o/oauth2/auth?client_id=a&redirect_uri=https://source.com/cb',
        'source.com'
      );
      sharingService.processUrl(
        'https://accounts.google.com/o/oauth2/auth?client_id=b&redirect_uri=https://target.com/cb',
        'target.com'
      );

      const result = await sharingService.getOrShareSession('target.com');

      expect(result).not.toBeNull();
      expect(result!.success).toBe(true);
      expect(result!.sourceDomain).toBe('source.com');
    });
  });

  describe('getRelatedDomains', () => {
    it('should return domains that share same IdP', () => {
      sharingService.processUrl(
        'https://github.com/login/oauth/authorize?client_id=a&redirect_uri=https://app1.com/cb',
        'app1.com'
      );
      sharingService.processUrl(
        'https://github.com/login/oauth/authorize?client_id=b&redirect_uri=https://app2.com/cb',
        'app2.com'
      );

      const related = sharingService.getRelatedDomains('app1.com');

      expect(related).toContain('app2.com');
    });
  });

  describe('getDomainGroups', () => {
    it('should return grouped domains by provider', () => {
      sharingService.processUrl(
        'https://accounts.google.com/o/oauth2/auth?client_id=a&redirect_uri=https://g1.com/cb',
        'g1.com'
      );
      sharingService.processUrl(
        'https://accounts.google.com/o/oauth2/auth?client_id=b&redirect_uri=https://g2.com/cb',
        'g2.com'
      );
      sharingService.processUrl(
        'https://github.com/login/oauth/authorize?client_id=c&redirect_uri=https://gh1.com/cb',
        'gh1.com'
      );

      const groups = sharingService.getDomainGroups();

      expect(groups.length).toBe(2);
      const googleGroup = groups.find(g => g.providerId === 'google');
      expect(googleGroup).toBeDefined();
      expect(googleGroup!.domains).toContain('g1.com');
      expect(googleGroup!.domains).toContain('g2.com');
    });
  });

  describe('state export/import', () => {
    it('should export and import state correctly', () => {
      sharingService.processUrl(
        'https://accounts.google.com/o/oauth2/auth?client_id=a&redirect_uri=https://app.com/cb',
        'app.com'
      );

      const state = sharingService.exportState();

      expect(state.relationships.length).toBe(1);
      expect(state.providerInfo).toBeDefined();

      // Create new service and import
      const newService = new SessionSharingService(mockSessionManager as any);
      newService.importState(state);

      const groups = newService.getDomainGroups();
      expect(groups.length).toBe(1);
    });
  });

  describe('getStats', () => {
    it('should return accurate statistics', () => {
      sharingService.processUrl(
        'https://accounts.google.com/o/oauth2/auth?client_id=a&redirect_uri=https://a.com/cb',
        'a.com'
      );
      sharingService.processUrl(
        'https://accounts.google.com/o/oauth2/auth?client_id=b&redirect_uri=https://b.com/cb',
        'b.com'
      );

      const stats = sharingService.getStats();

      expect(stats.totalRelationships).toBe(2);
      expect(stats.totalProviders).toBe(1);
      expect(stats.totalDomains).toBe(2);
    });
  });
});

// ============================================
// INTEGRATION TESTS
// ============================================

describe('Session Sharing Integration', () => {
  it('should detect and correlate domains in complete flow', () => {
    const detector = new SSOFlowDetector();
    const correlator = new DomainCorrelator();

    // Simulate user browsing app1.com and clicking "Sign in with Google"
    const flow1 = detector.detectFromUrl(
      'https://accounts.google.com/o/oauth2/auth?client_id=app1_client&redirect_uri=https://app1.com/callback&scope=email',
      'app1.com'
    );

    expect(flow1).not.toBeNull();
    correlator.learnFromFlow(flow1!);

    // Later, same user visits app2.com and clicks "Sign in with Google"
    const flow2 = detector.detectFromUrl(
      'https://accounts.google.com/o/oauth2/auth?client_id=app2_client&redirect_uri=https://app2.com/callback&scope=email',
      'app2.com'
    );

    expect(flow2).not.toBeNull();
    correlator.learnFromFlow(flow2!);

    // Now we should see app1 and app2 are related via Google
    const relatedToApp1 = correlator.getRelatedDomains('app1.com');
    expect(relatedToApp1).toContain('app2.com');

    const sharedProvider = correlator.findSharedProvider('app1.com', 'app2.com');
    expect(sharedProvider).not.toBeNull();
    expect(sharedProvider!.providerId).toBe('google');
  });
});
