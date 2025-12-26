# OAuth Flow Support

**Status:** 🚧 Foundation Implemented (GAP-018)
**Date:** 2025-12-26
**Related:** [FORM_AUTOMATION_IMPLEMENTATION.md](FORM_AUTOMATION_IMPLEMENTATION.md)

## Overview

The FormSubmissionLearner now includes **foundational support for OAuth 2.0 flows**. OAuth is a complex multi-step authorization protocol used by most modern authentication systems. This implementation provides the core infrastructure for detecting, tracking, and learning OAuth flows.

### Why OAuth Matters

OAuth 2.0 is the industry standard for authorization:
- **Social Login**: "Sign in with Google/GitHub/Facebook"
- **API Access**: Authorizing third-party apps
- **Enterprise SSO**: Corporate single sign-on
- **SaaS Integrations**: Connecting business tools

**Impact:** ~40-50% of modern auth flows use OAuth/OIDC.

## Current Implementation

### ✅ What's Implemented

**1. OAuth Detection**
- Detects OAuth authorization redirects via URL parameters
- Identifies `client_id`, `redirect_uri`, `response_type`, `scope`
- Recognizes PKCE parameters (`code_challenge`, `code_challenge_method`)
- Determines flow type (Authorization Code, Implicit, PKCE)

**2. Data Structures**
- `OAuthFlowInfo` interface - Complete OAuth flow parameters
- `LearnedOAuthFlow` interface - Learned OAuth patterns
- Storage Map for OAuth flows by trigger URL

**3. Flow Type Recognition**
- **Authorization Code Flow** (most common)
- **PKCE Flow** (mobile apps, SPAs)
- **Implicit Flow** (legacy, being phased out)

### 🚧 What Remains

**Full OAuth automation requires:**
1. **Redirect Tracking**: Follow multi-step redirect chain
2. **Token Exchange**: POST to token endpoint with authorization code
3. **PKCE Generation**: Generate code_verifier and code_challenge
4. **State Management**: Track state parameter across redirects
5. **Token Storage**: Secure storage of access/refresh tokens
6. **Flow Replay**: Automated replay of learned OAuth flows

## OAuth Flow Overview

### Authorization Code Flow (Most Common)

```
1. User clicks "Sign in with Provider"
   └─> App redirects to: /oauth/authorize?client_id=abc&redirect_uri=...&scope=...

2. User grants permission on provider's site
   └─> Provider redirects back: /callback?code=AUTH_CODE&state=...

3. App exchanges code for token
   └─> POST /oauth/token
       {
         grant_type: 'authorization_code',
         code: 'AUTH_CODE',
         client_id: 'abc',
         client_secret: 'secret',  // Sent from backend
         redirect_uri: '...'
       }

4. Provider returns access token
   └─> { access_token: 'xyz', refresh_token: '...', expires_in: 3600 }

5. App uses token to access APIs
   └─> Authorization: Bearer xyz
```

### PKCE Flow (Public Clients)

Same as Authorization Code, but:
- **Step 1**: Include `code_challenge` (SHA-256 hash of random verifier)
- **Step 3**: Include `code_verifier` (proves client is the same)
- **No client_secret**: Safe for mobile/SPA apps

## Implemented Interfaces

### OAuthFlowInfo

```typescript
export interface OAuthFlowInfo {
  flowType: 'authorization_code' | 'implicit' | 'pkce';
  authEndpoint: string;           // e.g., https://github.com/login/oauth/authorize
  tokenEndpoint?: string;          // e.g., https://github.com/login/oauth/access_token
  clientId: string;               // Public client identifier
  redirectUri: string;            // Where to redirect after auth
  scopes: string[];               // Requested permissions
  state?: string;                 // CSRF protection
  codeChallenge?: string;         // PKCE challenge
  codeChallengeMethod?: 'S256' | 'plain';
  responseType: string;           // 'code', 'token', or 'id_token'
}
```

### LearnedOAuthFlow

```typescript
export interface LearnedOAuthFlow {
  id: string;
  domain: string;
  triggerUrl: string;             // URL that initiates OAuth
  provider?: string;               // e.g., 'github', 'google'
  flow: OAuthFlowInfo;
  usesPKCE: boolean;
  learnedAt: number;
  timesUsed: number;
  successRate: number;
}
```

## Detection Example

**OAuth authorization URL:**
```
https://github.com/login/oauth/authorize?
  client_id=abc123&
  redirect_uri=https://myapp.com/callback&
  scope=repo%20user&
  state=random-csrf-token&
  response_type=code
```

**Detected flow:**
```typescript
{
  flowType: 'authorization_code',
  authEndpoint: 'https://github.com/login/oauth/authorize',
  clientId: 'abc123',
  redirectUri: 'https://myapp.com/callback',
  scopes: ['repo', 'user'],
  state: 'random-csrf-token',
  responseType: 'code'
}
```

## Current Capabilities

### OAuth Redirect Detection

```typescript
// Internal method (foundation)
private detectOAuthRedirect(url: string): OAuthFlowInfo | null {
  const params = new URL(url).searchParams;

  // Check for required OAuth parameters
  if (!params.has('client_id') || !params.has('response_type')) {
    return null;
  }

  // Extract flow parameters
  return {
    flowType: params.has('code_challenge') ? 'pkce' : 'authorization_code',
    authEndpoint: /* ... */,
    clientId: params.get('client_id'),
    redirectUri: params.get('redirect_uri'),
    scopes: params.get('scope').split(' '),
    // ... other parameters
  };
}
```

**Logs OAuth detection:**
```
[FormSubmissionLearner] Detected OAuth authorization redirect
  authEndpoint: https://github.com/login/oauth/authorize
  clientId: abc123
  flowType: authorization_code
  scopes: ['repo', 'user']
```

## Common OAuth Providers

### GitHub

```
Auth: https://github.com/login/oauth/authorize
Token: https://github.com/login/oauth/access_token
Scopes: repo, user, gist, notifications, etc.
```

### Google

```
Auth: https://accounts.google.com/o/oauth2/v2/auth
Token: https://oauth2.googleapis.com/token
Scopes: email, profile, https://www.googleapis.com/auth/drive, etc.
```

### Auth0

```
Auth: https://YOUR_DOMAIN.auth0.com/authorize
Token: https://YOUR_DOMAIN.auth0.com/oauth/token
Scopes: openid, profile, email, offline_access
```

## Implementation Roadmap

### Phase 1: Foundation ✅ (Current)
- OAuth URL parameter detection
- Flow type identification
- Data structure definitions
- Storage infrastructure

### Phase 2: Flow Tracking (Future)
- Monitor redirects via Page navigation events
- Track authorization → callback → token sequence
- Extract authorization code from callback
- Learn complete flow pattern

### Phase 3: Token Exchange (Future)
- POST to token endpoint with authorization code
- Handle client credentials (securely)
- Store access/refresh tokens
- Token refresh automation

### Phase 4: PKCE Generation (Future)
- Generate cryptographically random code_verifier
- Compute SHA-256 code_challenge
- Include in authorization request
- Prove identity in token exchange

### Phase 5: Flow Replay (Future)
- Automated OAuth initiation
- Headless consent (if previously granted)
- Token retrieval and storage
- Seamless re-authentication

## Security Considerations

### Current Implementation

✅ **State Parameter**: Detected and tracked for CSRF protection
✅ **PKCE Detection**: Recognizes PKCE-enhanced flows
✅ **Read-Only**: No token storage or transmission yet

### Future Requirements

🔒 **Token Security**:
- Tokens must be encrypted at rest
- Use secure storage (OS keychain, encrypted file)
- Never log tokens (even debug mode)
- Implement token rotation

🔒 **Client Secret Protection**:
- Never expose client_secret in frontend code
- Backend-only token exchange
- Environment variable storage

🔒 **PKCE Implementation**:
- Cryptographically secure random generation
- Proper SHA-256 hashing
- Verifier never transmitted to auth server

## Why OAuth Is Complex

**Multi-step redirect dance:**
1. App → Auth Server (authorization request)
2. User interacts with Auth Server (consent)
3. Auth Server → App (authorization code)
4. App → Auth Server (token exchange)
5. Auth Server → App (access token)

**Security requirements:**
- CSRF protection (state parameter)
- PKCE for public clients
- Secure token storage
- Token refresh logic
- Scope management

**Variability:**
- Different OAuth providers use different endpoints
- Custom scope names per provider
- Varying token formats (JWT vs opaque)
- Optional refresh tokens
- Provider-specific extensions

## Comparison to Other Auth Methods

| Method | Complexity | Security | Adoption |
|--------|------------|----------|----------|
| **OAuth 2.0** | High (multi-step) | High | Very Common |
| **API Keys** | Low (single header) | Medium | Common |
| **Basic Auth** | Low (username/password) | Low | Legacy |
| **Session Cookies** | Medium (stateful) | Medium | Common |
| **JWT Bearer** | Medium (token) | High | Growing |

OAuth's complexity provides strong security guarantees.

## Integration Points

### With 2FA Support

Many OAuth flows include 2FA:
```
1. OAuth authorization redirect
2. User logs into provider (triggers 2FA)
3. Provider shows consent screen
4. Redirect back with code
```

**Current:** 2FA within OAuth flow is handled by provider
**Future:** Detect and prompt for 2FA during OAuth replay

### With Rate Limiting

OAuth token endpoints are rate limited:
```
POST /oauth/token
429 Too Many Requests
Retry-After: 60
```

**Current:** Rate limiting support applies to OAuth endpoints
**Integration:** Token refresh respects rate limits automatically

## Testing OAuth Flows

### Manual Testing

```typescript
// Trigger OAuth flow
const learner = new FormSubmissionLearner(registry);

// Click "Sign in with GitHub"
await page.click('button:has-text("Sign in with GitHub")');

// System detects OAuth redirect
// [FormSubmissionLearner] Detected OAuth authorization redirect
//   authEndpoint: https://github.com/login/oauth/authorize
//   clientId: abc123
//   flowType: authorization_code
```

### Future Automation

```typescript
// Replay learned OAuth flow
const result = await learner.authenticateViaOAuth({
  provider: 'github',
  scopes: ['repo', 'user'],
  credentials: {
    username: 'user',
    password: 'pass'
  }
});

// Returns access token for API calls
console.log(result.accessToken);
```

## Limitations

### Current Limitations

1. **No Full Flow Tracking**: Detects authorization request, doesn't follow redirects
2. **No Token Exchange**: Cannot exchange authorization code for token
3. **No Replay**: Cannot automate OAuth flows yet
4. **No PKCE Generation**: Detects PKCE but doesn't generate verifiers
5. **No Token Management**: No token storage or refresh

### Architectural Challenges

**Redirect Following:**
- OAuth uses HTTP redirects (302/303)
- Need to intercept and track redirect chain
- Playwright page navigation events required

**Backend Token Exchange:**
- client_secret must stay on backend
- Cannot implement client-side
- Requires backend API or proxy

**User Consent:**
- First-time OAuth requires manual consent
- Subsequent auths may be automatic (if consent remembered)
- Cannot automate initial consent screen

## Related Documentation

- [2FA Support](TWO_FACTOR_AUTH_SUPPORT.md) - OTP integration with OAuth
- [Rate Limiting](RATE_LIMITING_SUPPORT.md) - OAuth endpoint rate limits

## References

- [OAuth 2.0 Specification (RFC 6749)](https://datatracker.ietf.org/doc/html/rfc6749)
- [PKCE (RFC 7636)](https://datatracker.ietf.org/doc/html/rfc7636)
- [OAuth 2.0 Security Best Practices](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-security-topics)

## Next Steps

To complete GAP-018, implement:

1. **Redirect Tracking** (Phase 2)
   - Use Playwright page.on('framenavigated') to track redirects
   - Capture authorization code from callback URL
   - Store complete redirect sequence

2. **Token Exchange** (Phase 3)
   - Implement POST to token endpoint
   - Handle client credentials securely
   - Parse token response (access_token, refresh_token, expires_in)

3. **PKCE Support** (Phase 4)
   - Generate random code_verifier (43-128 chars)
   - Compute SHA-256 code_challenge
   - Include in authorization and token requests

4. **Flow Replay** (Phase 5)
   - Initiate OAuth flow automatically
   - Fill provider login form (if needed)
   - Exchange code for token
   - Return token to caller

---

**Status:** 🚧 Foundation implemented, full automation pending
**Priority:** P1 (High)
**Estimated Effort:** Large (3-5 days for full implementation)
**Current Value:** OAuth detection and tracking infrastructure in place
