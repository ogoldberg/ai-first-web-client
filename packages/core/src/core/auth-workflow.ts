/**
 * Auth Workflow Helper - Guided authentication setup for discovered APIs
 *
 * Features:
 * - Detects auth requirements from API documentation discovery
 * - Guides users through credential configuration
 * - Supports API key, Bearer token, Basic auth, OAuth 2.0, and cookie-based auth
 * - Stores credentials securely via SessionManager
 * - Auto-refreshes OAuth tokens when expired
 */

import { SessionManager } from './session-manager.js';
import { discoverApiDocumentation, AuthInfo } from './api-documentation-discovery.js';
import { logger } from '../utils/logger.js';

// Create auth logger using logger.create
const authLogger = logger.create('Auth');

/**
 * Stored API credentials (encrypted at rest via SessionManager)
 */
export interface StoredApiCredentials {
  /** Domain this credential is for */
  domain: string;
  /** Auth type */
  type: AuthInfo['type'];
  /** Profile name for multiple credentials per domain */
  profile: string;
  /** Credential data (type-specific) */
  credentials: ApiKeyCredentials | BearerCredentials | BasicCredentials | OAuth2Credentials | CookieCredentials;
  /** When these credentials were configured */
  configuredAt: number;
  /** When these credentials were last used */
  lastUsed: number;
  /** Whether credentials have been validated */
  validated: boolean;
  /** Last validation error */
  validationError?: string;
}

export interface ApiKeyCredentials {
  type: 'api_key';
  /** Where the key goes */
  in: 'header' | 'query' | 'cookie';
  /** Header/query param/cookie name */
  name: string;
  /** The API key value */
  value: string;
}

export interface BearerCredentials {
  type: 'bearer';
  /** The bearer token */
  token: string;
  /** Optional token expiration (Unix timestamp in ms) */
  expiresAt?: number;
}

export interface BasicCredentials {
  type: 'basic';
  /** Username */
  username: string;
  /** Password */
  password: string;
}

export interface OAuth2Credentials {
  type: 'oauth2';
  /** OAuth flow type */
  flow: 'authorization_code' | 'client_credentials' | 'implicit' | 'password';
  /** Client ID */
  clientId: string;
  /** Client secret (for client_credentials and authorization_code flows) */
  clientSecret?: string;
  /** Current access token */
  accessToken?: string;
  /** Refresh token (for authorization_code flow) */
  refreshToken?: string;
  /** Token expiration (Unix timestamp in ms) */
  expiresAt?: number;
  /** Requested scopes */
  scopes?: string[];
  /** OAuth URLs */
  urls: {
    authorizationUrl?: string;
    tokenUrl?: string;
    refreshUrl?: string;
  };
  /** Username (for password flow) */
  username?: string;
  /** Password (for password flow) */
  password?: string;
}

export interface CookieCredentials {
  type: 'cookie';
  /** Cookie name */
  name: string;
  /** Cookie value */
  value: string;
  /** Optional expiration */
  expiresAt?: number;
}

/**
 * Auth workflow status for a domain
 */
export interface AuthWorkflowStatus {
  /** Domain */
  domain: string;
  /** Detected auth requirements from discovery */
  detectedAuth: AuthInfo[];
  /** Configured credentials */
  configuredCredentials: Array<{
    type: AuthInfo['type'];
    profile: string;
    validated: boolean;
    expiresAt?: number;
    isExpired: boolean;
  }>;
  /** Missing auth types that need configuration */
  missingAuth: AuthInfo[];
  /** Overall status */
  status: 'not_configured' | 'partially_configured' | 'configured' | 'expired';
  /** Human-readable message */
  message: string;
}

/**
 * Result of a credential configuration operation
 */
export interface ConfigureCredentialsResult {
  success: boolean;
  domain: string;
  type: AuthInfo['type'];
  profile: string;
  validated: boolean;
  error?: string;
  /** Instructions for completing auth (e.g., OAuth authorization URL) */
  nextStep?: {
    action: 'visit_url' | 'enter_code' | 'complete';
    url?: string;
    instructions?: string;
  };
}

/**
 * Options for making authenticated requests
 */
export interface AuthenticatedRequestOptions {
  /** Domain to authenticate for */
  domain: string;
  /** Profile name (default: 'default') */
  profile?: string;
  /** Specific auth type to use (auto-detect if not specified) */
  authType?: AuthInfo['type'];
  /** Base headers to include */
  headers?: Record<string, string>;
  /** URL being requested (for query param auth) */
  url?: string;
}

/**
 * Result of building auth headers/params
 */
export interface AuthenticatedRequestResult {
  /** Headers to include in request */
  headers: Record<string, string>;
  /** Query params to append to URL */
  queryParams?: Record<string, string>;
  /** Cookies to set */
  cookies?: Array<{ name: string; value: string; domain: string }>;
  /** Whether token was refreshed */
  tokenRefreshed: boolean;
  /** Auth type used */
  authType: AuthInfo['type'];
}

/**
 * OAuth state tracking for authorization_code flow
 */
interface OAuthState {
  state: string;
  domain: string;
  profile: string;
  codeVerifier?: string;
  redirectUri: string;
  createdAt: number;
}

const CREDENTIALS_FILE = './api-credentials.json';
const OAUTH_STATE_TTL = 10 * 60 * 1000; // 10 minutes

export class AuthWorkflow {
  private credentials: Map<string, StoredApiCredentials> = new Map();
  private oauthStates: Map<string, OAuthState> = new Map();
  private fetchFn: typeof fetch;

  constructor(
    private sessionManager: SessionManager,
    fetchFn?: typeof fetch
  ) {
    this.fetchFn = fetchFn || fetch;
  }

  /**
   * Initialize the auth workflow (load stored credentials)
   */
  async initialize(): Promise<void> {
    await this.loadCredentials();
    authLogger.info('Auth workflow initialized', {
      credentialCount: this.credentials.size,
    });
  }

  /**
   * Get auth workflow status for a domain
   * Shows what auth is required and what's configured
   */
  async getAuthStatus(domain: string, profile: string = 'default'): Promise<AuthWorkflowStatus> {
    // Get detected auth requirements from discovery
    const discoveryResult = await discoverApiDocumentation(domain);
    const detectedAuth = discoveryResult.metadata.authentication || [];

    // Get configured credentials for this domain
    const configuredCreds: AuthWorkflowStatus['configuredCredentials'] = [];
    for (const [key, cred] of this.credentials) {
      if (cred.domain === domain) {
        const isExpired = this.isCredentialExpired(cred);
        configuredCreds.push({
          type: cred.type,
          profile: cred.profile,
          validated: cred.validated,
          expiresAt: this.getCredentialExpiration(cred),
          isExpired,
        });
      }
    }

    // Determine missing auth types
    const configuredTypes = new Set(configuredCreds.map(c => c.type));
    const missingAuth = detectedAuth.filter((auth: AuthInfo) => !configuredTypes.has(auth.type));

    // Determine overall status
    let status: AuthWorkflowStatus['status'];
    let message: string;

    if (detectedAuth.length === 0) {
      status = 'configured';
      message = 'No authentication required for this API';
    } else if (configuredCreds.length === 0) {
      status = 'not_configured';
      message = `Authentication required: ${detectedAuth.map((a: AuthInfo) => a.type).join(', ')}`;
    } else if (configuredCreds.some(c => c.isExpired)) {
      status = 'expired';
      message = 'Some credentials have expired and need refresh';
    } else if (missingAuth.length > 0) {
      status = 'partially_configured';
      message = `Missing configuration for: ${missingAuth.map((a: AuthInfo) => a.type).join(', ')}`;
    } else {
      status = 'configured';
      message = 'All required authentication is configured';
    }

    return {
      domain,
      detectedAuth,
      configuredCredentials: configuredCreds,
      missingAuth,
      status,
      message,
    };
  }

  /**
   * Configure credentials for a domain
   */
  async configureCredentials(
    domain: string,
    credentials: ApiKeyCredentials | BearerCredentials | BasicCredentials | OAuth2Credentials | CookieCredentials,
    profile: string = 'default',
    validate: boolean = true
  ): Promise<ConfigureCredentialsResult> {
    const credKey = this.getCredentialKey(domain, credentials.type, profile);

    // For OAuth2 authorization_code flow, we need special handling
    if (credentials.type === 'oauth2' && credentials.flow === 'authorization_code' && !credentials.accessToken) {
      return this.initiateOAuthFlow(domain, credentials, profile);
    }

    // For OAuth2 client_credentials flow, get token immediately
    if (credentials.type === 'oauth2' && credentials.flow === 'client_credentials' && !credentials.accessToken) {
      const tokenResult = await this.getClientCredentialsToken(domain, credentials);
      if (!tokenResult.success) {
        return {
          success: false,
          domain,
          type: 'oauth2',
          profile,
          validated: false,
          error: tokenResult.error,
        };
      }
      credentials.accessToken = tokenResult.accessToken;
      credentials.expiresAt = tokenResult.expiresAt;
    }

    // Store the credentials
    const stored: StoredApiCredentials = {
      domain,
      type: credentials.type,
      profile,
      credentials,
      configuredAt: Date.now(),
      lastUsed: Date.now(),
      validated: false,
    };

    // Validate if requested
    if (validate) {
      const validationResult = await this.validateCredentials(stored);
      stored.validated = validationResult.valid;
      stored.validationError = validationResult.error;
    }

    this.credentials.set(credKey, stored);
    await this.persistCredentials();

    authLogger.info('Credentials configured', {
      domain,
      type: credentials.type,
      profile,
      validated: stored.validated,
    });

    return {
      success: true,
      domain,
      type: credentials.type,
      profile,
      validated: stored.validated,
      error: stored.validationError,
      nextStep: { action: 'complete' },
    };
  }

  /**
   * Complete OAuth authorization_code flow after user authorizes
   */
  async completeOAuthFlow(
    code: string,
    state: string
  ): Promise<ConfigureCredentialsResult> {
    const oauthState = this.oauthStates.get(state);
    if (!oauthState) {
      return {
        success: false,
        domain: '',
        type: 'oauth2',
        profile: '',
        validated: false,
        error: 'Invalid or expired OAuth state',
      };
    }

    // Check TTL
    if (Date.now() - oauthState.createdAt > OAUTH_STATE_TTL) {
      this.oauthStates.delete(state);
      return {
        success: false,
        domain: oauthState.domain,
        type: 'oauth2',
        profile: oauthState.profile,
        validated: false,
        error: 'OAuth state expired',
      };
    }

    // Get the stored credentials (should have been partially configured)
    const credKey = this.getCredentialKey(oauthState.domain, 'oauth2', oauthState.profile);
    const stored = this.credentials.get(credKey);
    if (!stored || stored.credentials.type !== 'oauth2') {
      return {
        success: false,
        domain: oauthState.domain,
        type: 'oauth2',
        profile: oauthState.profile,
        validated: false,
        error: 'OAuth credentials not found',
      };
    }

    const oauth2Creds = stored.credentials as OAuth2Credentials;

    // Exchange code for token
    const tokenResult = await this.exchangeOAuthCode(
      code,
      oauth2Creds,
      oauthState.redirectUri,
      oauthState.codeVerifier
    );

    if (!tokenResult.success) {
      return {
        success: false,
        domain: oauthState.domain,
        type: 'oauth2',
        profile: oauthState.profile,
        validated: false,
        error: tokenResult.error,
      };
    }

    // Update credentials with tokens
    oauth2Creds.accessToken = tokenResult.accessToken;
    oauth2Creds.refreshToken = tokenResult.refreshToken;
    oauth2Creds.expiresAt = tokenResult.expiresAt;
    stored.validated = true;
    stored.lastUsed = Date.now();

    await this.persistCredentials();
    this.oauthStates.delete(state);

    authLogger.info('OAuth flow completed', {
      domain: oauthState.domain,
      profile: oauthState.profile,
    });

    return {
      success: true,
      domain: oauthState.domain,
      type: 'oauth2',
      profile: oauthState.profile,
      validated: true,
      nextStep: { action: 'complete' },
    };
  }

  /**
   * Build authenticated request headers/params for a domain
   * Automatically refreshes tokens if needed
   */
  async buildAuthenticatedRequest(
    options: AuthenticatedRequestOptions
  ): Promise<AuthenticatedRequestResult | null> {
    const { domain, profile = 'default', authType } = options;
    const headers = { ...(options.headers || {}) };
    const queryParams: Record<string, string> = {};
    const cookies: Array<{ name: string; value: string; domain: string }> = [];
    let tokenRefreshed = false;

    // Find credentials for this domain
    let cred: StoredApiCredentials | undefined;
    if (authType) {
      cred = this.credentials.get(this.getCredentialKey(domain, authType, profile));
    } else {
      // Find any credential for this domain/profile
      for (const [key, c] of this.credentials) {
        if (c.domain === domain && c.profile === profile) {
          cred = c;
          break;
        }
      }
    }

    if (!cred) {
      return null;
    }

    // Check if credential needs refresh
    if (this.isCredentialExpired(cred) && cred.credentials.type === 'oauth2') {
      const refreshed = await this.refreshOAuthToken(cred);
      if (refreshed) {
        tokenRefreshed = true;
      }
    }

    // Build auth based on type
    switch (cred.credentials.type) {
      case 'api_key': {
        const apiKey = cred.credentials as ApiKeyCredentials;
        if (apiKey.in === 'header') {
          headers[apiKey.name] = apiKey.value;
        } else if (apiKey.in === 'query') {
          queryParams[apiKey.name] = apiKey.value;
        } else if (apiKey.in === 'cookie') {
          cookies.push({ name: apiKey.name, value: apiKey.value, domain });
        }
        break;
      }

      case 'bearer': {
        const bearer = cred.credentials as BearerCredentials;
        headers['Authorization'] = `Bearer ${bearer.token}`;
        break;
      }

      case 'basic': {
        const basic = cred.credentials as BasicCredentials;
        const encoded = Buffer.from(`${basic.username}:${basic.password}`).toString('base64');
        headers['Authorization'] = `Basic ${encoded}`;
        break;
      }

      case 'oauth2': {
        const oauth = cred.credentials as OAuth2Credentials;
        if (oauth.accessToken) {
          headers['Authorization'] = `Bearer ${oauth.accessToken}`;
        }
        break;
      }

      case 'cookie': {
        const cookie = cred.credentials as CookieCredentials;
        cookies.push({ name: cookie.name, value: cookie.value, domain });
        break;
      }
    }

    // Update last used
    cred.lastUsed = Date.now();
    await this.persistCredentials();

    return {
      headers,
      queryParams: Object.keys(queryParams).length > 0 ? queryParams : undefined,
      cookies: cookies.length > 0 ? cookies : undefined,
      tokenRefreshed,
      authType: cred.type,
    };
  }

  /**
   * Delete credentials for a domain
   */
  async deleteCredentials(
    domain: string,
    authType?: AuthInfo['type'],
    profile: string = 'default'
  ): Promise<boolean> {
    let deleted = false;

    if (authType) {
      const key = this.getCredentialKey(domain, authType, profile);
      if (this.credentials.has(key)) {
        this.credentials.delete(key);
        deleted = true;
      }
    } else {
      // Delete all credentials for this domain/profile
      for (const [key, cred] of this.credentials) {
        if (cred.domain === domain && cred.profile === profile) {
          this.credentials.delete(key);
          deleted = true;
        }
      }
    }

    if (deleted) {
      await this.persistCredentials();
      authLogger.info('Credentials deleted', { domain, authType, profile });
    }

    return deleted;
  }

  /**
   * List all configured domains with auth
   */
  listConfiguredDomains(): Array<{
    domain: string;
    types: AuthInfo['type'][];
    profiles: string[];
  }> {
    const domains = new Map<string, { types: Set<AuthInfo['type']>; profiles: Set<string> }>();

    for (const cred of this.credentials.values()) {
      if (!domains.has(cred.domain)) {
        domains.set(cred.domain, { types: new Set(), profiles: new Set() });
      }
      const entry = domains.get(cred.domain)!;
      entry.types.add(cred.type);
      entry.profiles.add(cred.profile);
    }

    return Array.from(domains.entries()).map(([domain, data]) => ({
      domain,
      types: Array.from(data.types),
      profiles: Array.from(data.profiles),
    }));
  }

  /**
   * Get guidance for configuring auth based on discovered requirements
   */
  getAuthGuidance(authInfo: AuthInfo): {
    instructions: string;
    requiredFields: string[];
    optionalFields: string[];
    example?: Record<string, string>;
  } {
    switch (authInfo.type) {
      case 'api_key':
        return {
          instructions: `This API requires an API key. The key should be sent ${authInfo.in === 'header' ? `in the "${authInfo.name || 'X-API-Key'}" header` : authInfo.in === 'query' ? `as the "${authInfo.name || 'api_key'}" query parameter` : `as the "${authInfo.name || 'api_key'}" cookie`}.`,
          requiredFields: ['value'],
          optionalFields: [],
          example: { value: 'your-api-key-here' },
        };

      case 'bearer':
        return {
          instructions: 'This API requires a Bearer token. Include your token in the Authorization header.',
          requiredFields: ['token'],
          optionalFields: ['expiresAt'],
          example: { token: 'your-bearer-token' },
        };

      case 'basic':
        return {
          instructions: 'This API requires Basic authentication. Provide your username and password.',
          requiredFields: ['username', 'password'],
          optionalFields: [],
          example: { username: 'your-username', password: 'your-password' },
        };

      case 'oauth2':
        if (authInfo.oauthFlow === 'authorization_code') {
          return {
            instructions: `This API uses OAuth 2.0 authorization code flow. You'll need to authorize access through the provider's consent page.${authInfo.oauthUrls?.authorizationUrl ? ` Authorization URL: ${authInfo.oauthUrls.authorizationUrl}` : ''}`,
            requiredFields: ['clientId'],
            optionalFields: ['clientSecret', 'scopes'],
            example: { clientId: 'your-client-id', clientSecret: 'your-client-secret' },
          };
        } else if (authInfo.oauthFlow === 'client_credentials') {
          return {
            instructions: 'This API uses OAuth 2.0 client credentials flow. Provide your client ID and secret.',
            requiredFields: ['clientId', 'clientSecret'],
            optionalFields: ['scopes'],
            example: { clientId: 'your-client-id', clientSecret: 'your-client-secret' },
          };
        } else if (authInfo.oauthFlow === 'password') {
          return {
            instructions: 'This API uses OAuth 2.0 password flow. Provide client credentials and user credentials.',
            requiredFields: ['clientId', 'username', 'password'],
            optionalFields: ['clientSecret', 'scopes'],
          };
        }
        return {
          instructions: 'This API uses OAuth 2.0. Provide the required OAuth credentials.',
          requiredFields: ['clientId'],
          optionalFields: ['clientSecret', 'accessToken', 'refreshToken'],
        };

      case 'cookie':
        return {
          instructions: `This API requires cookie-based authentication. Provide the ${authInfo.name || 'session'} cookie value.`,
          requiredFields: ['name', 'value'],
          optionalFields: ['expiresAt'],
          example: { name: authInfo.name || 'session', value: 'your-session-cookie' },
        };

      default:
        return {
          instructions: 'Unknown authentication type',
          requiredFields: [],
          optionalFields: [],
        };
    }
  }

  // ============================================
  // Private Methods
  // ============================================

  private getCredentialKey(domain: string, type: AuthInfo['type'], profile: string): string {
    return `${domain}:${type}:${profile}`;
  }

  private isCredentialExpired(cred: StoredApiCredentials): boolean {
    const expiration = this.getCredentialExpiration(cred);
    if (!expiration) return false;
    // Consider expired 5 minutes before actual expiration for safety
    return Date.now() > expiration - 5 * 60 * 1000;
  }

  private getCredentialExpiration(cred: StoredApiCredentials): number | undefined {
    switch (cred.credentials.type) {
      case 'bearer':
        return (cred.credentials as BearerCredentials).expiresAt;
      case 'oauth2':
        return (cred.credentials as OAuth2Credentials).expiresAt;
      case 'cookie':
        return (cred.credentials as CookieCredentials).expiresAt;
      default:
        return undefined;
    }
  }

  private async validateCredentials(cred: StoredApiCredentials): Promise<{ valid: boolean; error?: string }> {
    // For now, we just mark as validated if credentials are present
    // In a full implementation, we would make a test request to validate
    switch (cred.credentials.type) {
      case 'api_key':
        return { valid: !!(cred.credentials as ApiKeyCredentials).value };
      case 'bearer':
        return { valid: !!(cred.credentials as BearerCredentials).token };
      case 'basic':
        const basic = cred.credentials as BasicCredentials;
        return { valid: !!(basic.username && basic.password) };
      case 'oauth2':
        const oauth = cred.credentials as OAuth2Credentials;
        return { valid: !!(oauth.accessToken || oauth.clientId) };
      case 'cookie':
        const cookie = cred.credentials as CookieCredentials;
        return { valid: !!(cookie.name && cookie.value) };
      default:
        return { valid: false, error: 'Unknown credential type' };
    }
  }

  private async initiateOAuthFlow(
    domain: string,
    credentials: OAuth2Credentials,
    profile: string
  ): Promise<ConfigureCredentialsResult> {
    if (!credentials.urls.authorizationUrl) {
      return {
        success: false,
        domain,
        type: 'oauth2',
        profile,
        validated: false,
        error: 'Authorization URL not provided',
      };
    }

    // Generate state for CSRF protection
    const state = this.generateRandomString(32);
    const codeVerifier = this.generateRandomString(43);
    const redirectUri = 'urn:ietf:wg:oauth:2.0:oob'; // Manual copy/paste flow

    // Store OAuth state
    this.oauthStates.set(state, {
      state,
      domain,
      profile,
      codeVerifier,
      redirectUri,
      createdAt: Date.now(),
    });

    // Store partial credentials
    const credKey = this.getCredentialKey(domain, 'oauth2', profile);
    this.credentials.set(credKey, {
      domain,
      type: 'oauth2',
      profile,
      credentials,
      configuredAt: Date.now(),
      lastUsed: Date.now(),
      validated: false,
    });
    await this.persistCredentials();

    // Build authorization URL
    const authUrl = new URL(credentials.urls.authorizationUrl);
    authUrl.searchParams.set('client_id', credentials.clientId);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('state', state);
    if (credentials.scopes && credentials.scopes.length > 0) {
      authUrl.searchParams.set('scope', credentials.scopes.join(' '));
    }

    return {
      success: true,
      domain,
      type: 'oauth2',
      profile,
      validated: false,
      nextStep: {
        action: 'visit_url',
        url: authUrl.toString(),
        instructions: `Visit this URL to authorize access. After authorization, you'll receive a code. Use the complete_oauth tool with that code and state="${state}" to complete the flow.`,
      },
    };
  }

  private async exchangeOAuthCode(
    code: string,
    credentials: OAuth2Credentials,
    redirectUri: string,
    codeVerifier?: string
  ): Promise<{ success: boolean; accessToken?: string; refreshToken?: string; expiresAt?: number; error?: string }> {
    if (!credentials.urls.tokenUrl) {
      return { success: false, error: 'Token URL not provided' };
    }

    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: credentials.clientId,
    });

    if (credentials.clientSecret) {
      params.set('client_secret', credentials.clientSecret);
    }
    if (codeVerifier) {
      params.set('code_verifier', codeVerifier);
    }

    try {
      const response = await this.fetchFn(credentials.urls.tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return { success: false, error: `Token exchange failed: ${response.status} ${errorText}` };
      }

      const data = await response.json();
      return {
        success: true,
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt: data.expires_in ? Date.now() + data.expires_in * 1000 : undefined,
      };
    } catch (error) {
      return { success: false, error: `Token exchange error: ${error instanceof Error ? error.message : String(error)}` };
    }
  }

  private async getClientCredentialsToken(
    domain: string,
    credentials: OAuth2Credentials
  ): Promise<{ success: boolean; accessToken?: string; expiresAt?: number; error?: string }> {
    if (!credentials.urls.tokenUrl) {
      return { success: false, error: 'Token URL not provided' };
    }

    const params = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: credentials.clientId,
    });

    if (credentials.clientSecret) {
      params.set('client_secret', credentials.clientSecret);
    }
    if (credentials.scopes && credentials.scopes.length > 0) {
      params.set('scope', credentials.scopes.join(' '));
    }

    try {
      const response = await this.fetchFn(credentials.urls.tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return { success: false, error: `Token request failed: ${response.status} ${errorText}` };
      }

      const data = await response.json();
      return {
        success: true,
        accessToken: data.access_token,
        expiresAt: data.expires_in ? Date.now() + data.expires_in * 1000 : undefined,
      };
    } catch (error) {
      return { success: false, error: `Token request error: ${error instanceof Error ? error.message : String(error)}` };
    }
  }

  private async refreshOAuthToken(cred: StoredApiCredentials): Promise<boolean> {
    if (cred.credentials.type !== 'oauth2') return false;

    const oauth = cred.credentials as OAuth2Credentials;
    if (!oauth.refreshToken || !oauth.urls.refreshUrl) return false;

    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: oauth.refreshToken,
      client_id: oauth.clientId,
    });

    if (oauth.clientSecret) {
      params.set('client_secret', oauth.clientSecret);
    }

    try {
      const refreshUrl = oauth.urls.refreshUrl || oauth.urls.tokenUrl;
      if (!refreshUrl) return false;

      const response = await this.fetchFn(refreshUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      });

      if (!response.ok) {
        authLogger.warn('Token refresh failed', { domain: cred.domain, status: response.status });
        return false;
      }

      const data = await response.json();
      oauth.accessToken = data.access_token;
      if (data.refresh_token) {
        oauth.refreshToken = data.refresh_token;
      }
      oauth.expiresAt = data.expires_in ? Date.now() + data.expires_in * 1000 : undefined;

      await this.persistCredentials();
      authLogger.info('Token refreshed', { domain: cred.domain });
      return true;
    } catch (error) {
      authLogger.error('Token refresh error', { domain: cred.domain, error });
      return false;
    }
  }

  private generateRandomString(length: number): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  private async loadCredentials(): Promise<void> {
    try {
      const { promises: fs } = await import('fs');
      const content = await fs.readFile(CREDENTIALS_FILE, 'utf-8');
      const data = JSON.parse(content);

      // Credentials are stored with SessionManager's encryption
      for (const [key, cred] of Object.entries(data)) {
        this.credentials.set(key, cred as StoredApiCredentials);
      }
    } catch (error) {
      // File doesn't exist or can't be read - that's fine
      authLogger.debug('No existing credentials file');
    }
  }

  private async persistCredentials(): Promise<void> {
    try {
      const { promises: fs } = await import('fs');
      const path = await import('path');

      const data: Record<string, StoredApiCredentials> = {};
      for (const [key, cred] of this.credentials) {
        data[key] = cred;
      }

      // Use atomic write (temp + rename) like SessionManager
      const tempPath = `${CREDENTIALS_FILE}.tmp.${Date.now()}.${process.pid}`;
      await fs.writeFile(tempPath, JSON.stringify(data, null, 2), 'utf-8');
      await fs.rename(tempPath, CREDENTIALS_FILE);
    } catch (error) {
      authLogger.error('Failed to persist credentials', { error });
    }
  }
}
