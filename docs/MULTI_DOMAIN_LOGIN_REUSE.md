# Multi-Domain Login Reuse (GAP-009)

**Status:** Implemented
**Date:** 2025-12-27

## Overview

Multi-Domain Login Reuse enables cross-domain session sharing for SSO-authenticated domains. When a user logs in via SSO (OAuth, SAML, or social login) on one domain, their session can be automatically shared with other domains that use the same identity provider.

**Impact:** Faster SSO flows, reduced login friction, automatic credential reuse.

## How It Works

### 1. SSO Flow Detection

The `SSOFlowDetector` identifies SSO flows during browsing:

- **OAuth 2.0/OIDC Flows**: Detects authorization URLs from known providers (Google, GitHub, Microsoft, etc.)
- **SAML Flows**: Detects SAML requests and responses
- **Social Login Buttons**: Detects "Sign in with X" buttons in page content

```typescript
import { SSOFlowDetector } from 'llm-browser/core/sso-flow-detector';

const detector = new SSOFlowDetector();

// Detect from navigation URL
const flow = detector.detectFromUrl(
  'https://accounts.google.com/o/oauth2/auth?client_id=abc&redirect_uri=https://myapp.com/callback',
  'myapp.com'
);

// Detect social login buttons in HTML
const buttons = detector.detectFromContent(html, 'myapp.com');
```

### 2. Domain Correlation

The `DomainCorrelator` learns which domains share identity providers:

```typescript
import { DomainCorrelator } from 'llm-browser/core/domain-correlator';

const correlator = new DomainCorrelator();

// Learn from detected flows
correlator.learnFromFlow(flow);

// Find related domains
const relatedDomains = correlator.getRelatedDomains('app1.com');
// Returns: ['app2.com', 'app3.com'] if they share an IdP

// Get domain groups by provider
const groups = correlator.getDomainGroups();
// Returns: [{ providerId: 'google', domains: ['app1.com', 'app2.com'] }]
```

### 3. Session Sharing

The `SessionSharingService` ties everything together:

```typescript
import { SessionSharingService } from 'llm-browser/core/session-sharing';

const sharingService = new SessionSharingService(sessionManager);

// Process URLs during browsing to detect SSO flows
sharingService.processUrl(navigationUrl, currentDomain);

// Get or share a session for a target domain
const result = await sharingService.getOrShareSession('targetdomain.com');

if (result?.success) {
  console.log(`Session shared from ${result.sourceDomain}`);
  console.log(`Provider: ${result.providerId}`);
  console.log(`Shared: ${result.sharedItems.join(', ')}`);
}
```

## Supported Identity Providers

### Known Providers (Auto-detected)

| Provider | Type | Domains |
|----------|------|---------|
| Google | OIDC | accounts.google.com |
| GitHub | OAuth | github.com |
| Microsoft | OIDC | login.microsoftonline.com, login.live.com |
| Facebook | OAuth | facebook.com |
| Apple | OIDC | appleid.apple.com |
| Twitter/X | OAuth | twitter.com, x.com |
| LinkedIn | OAuth | linkedin.com |
| Okta | OIDC | *.okta.com (dynamic) |
| Auth0 | OIDC | *.auth0.com (dynamic) |
| AWS Cognito | OIDC | *.amazoncognito.com (dynamic) |

### Custom Providers

Register custom identity providers:

```typescript
detector.registerProvider({
  id: 'custom_idp',
  name: 'Custom IdP',
  type: 'oidc',
  domains: ['auth.example.com'],
  authEndpoints: [/auth\.example\.com\/oauth/i],
});
```

## Configuration Options

### SSOFlowDetector Options

```typescript
const detector = new SSOFlowDetector({
  detectFromUrls: true,     // Detect from navigation URLs
  detectFromContent: true,  // Detect from page HTML (social buttons)
  detectFromNetwork: true,  // Detect from network requests
});
```

### SessionSharing Options

```typescript
const result = await sharingService.shareSession('source.com', 'target.com', {
  minConfidence: 0.5,         // Minimum correlation confidence
  shareLocalStorage: true,     // Include localStorage
  shareSessionStorage: false,  // Include sessionStorage
  filterCookies: true,         // Only share IdP-related cookies
  sessionProfile: 'default',   // Session profile to use
});
```

## Data Structures

### SSOFlowInfo

```typescript
interface SSOFlowInfo {
  flowId: string;
  provider: IdentityProvider;
  flowType: 'oauth_authorize' | 'oauth_callback' | 'saml_request' | 'saml_response' | 'social_button';
  initiatingDomain: string;
  idpDomain: string;
  targetDomain?: string;
  clientId?: string;
  scopes?: string[];
  detectedAt: number;
  triggerUrl: string;
}
```

### DomainSSORelationship

```typescript
interface DomainSSORelationship {
  domain: string;
  providerId: string;
  clientId?: string;
  confidence: number;
  observationCount: number;
  lastObserved: number;
  firstObserved: number;
}
```

## Persistence

Domain correlations can be persisted and restored:

```typescript
// Export state
const state = sharingService.exportState();
await fs.writeFile('correlations.json', JSON.stringify(state));

// Import state
const savedState = JSON.parse(await fs.readFile('correlations.json', 'utf-8'));
sharingService.importState(savedState);
```

## Confidence and Decay

- **Initial confidence**: 0.6 for direct observations, 0.5 for indirect
- **Confidence increase**: +10% per observation (diminishing returns)
- **Decay rate**: 5% per 30 days of non-use
- **Stale threshold**: Relationships removed after 90 days

## Privacy Considerations

1. **Cookie Filtering**: By default, only IdP-related cookies are shared (session, auth tokens)
2. **Domain Isolation**: Sessions are never shared across unrelated domains
3. **Confidence Threshold**: Only high-confidence relationships are used
4. **User Control**: Session sharing can be disabled per-domain

## Integration with SmartBrowser

The session sharing service integrates with SmartBrowser's existing session infrastructure:

```typescript
// In SmartBrowser initialization
this.sessionSharing = new SessionSharingService(this.sessionManager);

// During browsing
if (needsAuth && !hasSession) {
  const shared = await this.sessionSharing.getOrShareSession(domain);
  if (shared?.success) {
    // Session was shared, retry the request
    return this.browse(url, options);
  }
}
```

## Statistics and Monitoring

```typescript
const stats = sharingService.getStats();
// {
//   totalRelationships: 15,
//   totalProviders: 4,
//   totalDomains: 12,
//   largestGroup: 5,
//   averageGroupSize: 3.75
// }
```

## Examples

### Basic Usage

```typescript
import { SessionSharingService } from 'llm-browser/core/session-sharing';
import { SessionManager } from 'llm-browser/core/session-manager';

const sessionManager = new SessionManager('./sessions');
await sessionManager.initialize();

const sharing = new SessionSharingService(sessionManager);

// During browsing, process URLs to learn SSO relationships
sharing.processUrl(currentUrl, currentDomain);

// When a domain needs authentication
const candidates = await sharing.findSessionCandidates('newapp.com');
if (candidates.length > 0) {
  console.log(`Found ${candidates.length} candidate sessions from related domains`);
}
```

### Finding Related Domains

```typescript
// User logged into github.com
sharing.processUrl('https://github.com/login/oauth/authorize?client_id=abc', 'myapp1.com');

// User also logged into another app with GitHub
sharing.processUrl('https://github.com/login/oauth/authorize?client_id=def', 'myapp2.com');

// Now these domains are related
const related = sharing.getRelatedDomains('myapp1.com');
// ['myapp2.com']
```

## Related Documentation

- [OAuth Flow Support](OAUTH_FLOW_SUPPORT.md) - OAuth detection foundation
- [Auth Flow Detector](../src/core/auth-flow-detector.ts) - Authentication challenge detection
- [Session Manager](../src/core/session-manager.ts) - Session persistence
