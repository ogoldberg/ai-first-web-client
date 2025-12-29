/**
 * OAuth Service
 *
 * Handles OAuth authentication flows for Google and GitHub.
 * Manages OAuth state for CSRF protection.
 */

import { randomBytes } from 'crypto';

// =============================================================================
// OAuth State Management
// =============================================================================

interface OAuthStateEntry {
  provider: string;
  expiresAt: number;
  redirectTo?: string; // Optional post-login redirect
}

// In-memory state store (use Redis in production for multi-instance)
const oauthStates = new Map<string, OAuthStateEntry>();

// Clean up expired states every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [state, entry] of oauthStates.entries()) {
    if (now > entry.expiresAt) {
      oauthStates.delete(state);
    }
  }
}, 5 * 60 * 1000);

/**
 * Generate OAuth state parameter for CSRF protection
 */
export function generateOAuthState(provider: string, redirectTo?: string): string {
  const state = randomBytes(32).toString('base64url');
  oauthStates.set(state, {
    provider,
    expiresAt: Date.now() + 10 * 60 * 1000, // 10 minutes
    redirectTo,
  });
  return state;
}

/**
 * Validate OAuth state parameter
 *
 * Returns the redirect URL if valid, null if invalid.
 * State is consumed (deleted) on validation.
 */
export function validateOAuthState(
  state: string,
  expectedProvider: string
): { valid: true; redirectTo?: string } | { valid: false } {
  const entry = oauthStates.get(state);

  if (!entry) {
    return { valid: false };
  }

  // Consume the state (one-time use)
  oauthStates.delete(state);

  if (Date.now() > entry.expiresAt) {
    return { valid: false };
  }

  if (entry.provider !== expectedProvider) {
    return { valid: false };
  }

  return { valid: true, redirectTo: entry.redirectTo };
}

// =============================================================================
// OAuth Configuration
// =============================================================================

/**
 * Check if Google OAuth is configured
 */
export function isGoogleOAuthConfigured(): boolean {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

/**
 * Check if GitHub OAuth is configured
 */
export function isGitHubOAuthConfigured(): boolean {
  return !!(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET);
}

/**
 * Get the app URL for callbacks
 */
function getAppUrl(): string {
  return process.env.APP_URL || 'http://localhost:3001';
}

// =============================================================================
// Google OAuth
// =============================================================================

/**
 * Get the Google OAuth authorization URL
 */
export function getGoogleAuthUrl(state: string): string {
  if (!isGoogleOAuthConfigured()) {
    throw new Error('Google OAuth not configured');
  }

  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: `${getAppUrl()}/auth/google/callback`,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    access_type: 'offline', // Get refresh token
    prompt: 'consent', // Always show consent screen
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

/**
 * Google user info from OAuth
 */
export interface GoogleUserInfo {
  id: string;
  email: string;
  name: string;
  picture?: string;
  verified_email: boolean;
}

/**
 * Exchange Google authorization code for user info
 */
export async function exchangeGoogleCode(code: string): Promise<GoogleUserInfo> {
  if (!isGoogleOAuthConfigured()) {
    throw new Error('Google OAuth not configured');
  }

  // Exchange code for tokens
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      code,
      grant_type: 'authorization_code',
      redirect_uri: `${getAppUrl()}/auth/google/callback`,
    }),
  });

  if (!tokenResponse.ok) {
    const error = await tokenResponse.text();
    console.error('[OAuth] Google token exchange failed:', error);
    throw new Error('Failed to exchange authorization code');
  }

  const tokens = (await tokenResponse.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };

  // Get user info
  const userResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });

  if (!userResponse.ok) {
    throw new Error('Failed to get user info from Google');
  }

  return userResponse.json() as Promise<GoogleUserInfo>;
}

// =============================================================================
// GitHub OAuth
// =============================================================================

/**
 * Get the GitHub OAuth authorization URL
 */
export function getGitHubAuthUrl(state: string): string {
  if (!isGitHubOAuthConfigured()) {
    throw new Error('GitHub OAuth not configured');
  }

  const params = new URLSearchParams({
    client_id: process.env.GITHUB_CLIENT_ID!,
    redirect_uri: `${getAppUrl()}/auth/github/callback`,
    scope: 'user:email',
    state,
  });

  return `https://github.com/login/oauth/authorize?${params}`;
}

/**
 * GitHub user info from OAuth
 */
export interface GitHubUserInfo {
  id: number;
  login: string;
  email: string | null;
  name: string | null;
  avatar_url?: string;
}

/**
 * GitHub email info
 */
interface GitHubEmail {
  email: string;
  primary: boolean;
  verified: boolean;
}

/**
 * Exchange GitHub authorization code for user info
 */
export async function exchangeGitHubCode(code: string): Promise<GitHubUserInfo> {
  if (!isGitHubOAuthConfigured()) {
    throw new Error('GitHub OAuth not configured');
  }

  // Exchange code for tokens
  const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      client_id: process.env.GITHUB_CLIENT_ID!,
      client_secret: process.env.GITHUB_CLIENT_SECRET!,
      code,
      redirect_uri: `${getAppUrl()}/auth/github/callback`,
    }),
  });

  if (!tokenResponse.ok) {
    throw new Error('Failed to exchange authorization code');
  }

  const tokenData = (await tokenResponse.json()) as {
    access_token: string;
    token_type: string;
    scope: string;
    error?: string;
  };

  if (tokenData.error) {
    console.error('[OAuth] GitHub token exchange failed:', tokenData.error);
    throw new Error('Failed to exchange authorization code');
  }

  const accessToken = tokenData.access_token;

  // Get user info
  const userResponse = await fetch('https://api.github.com/user', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/vnd.github.v3+json',
    },
  });

  if (!userResponse.ok) {
    throw new Error('Failed to get user info from GitHub');
  }

  const userInfo = (await userResponse.json()) as GitHubUserInfo;

  // If email is not public, fetch from emails endpoint
  if (!userInfo.email) {
    const emailResponse = await fetch('https://api.github.com/user/emails', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github.v3+json',
      },
    });

    if (emailResponse.ok) {
      const emails = (await emailResponse.json()) as GitHubEmail[];
      // Find primary verified email
      const primaryEmail = emails.find((e) => e.primary && e.verified);
      const verifiedEmail = emails.find((e) => e.verified);
      userInfo.email = primaryEmail?.email || verifiedEmail?.email || null;
    }
  }

  return userInfo;
}

// =============================================================================
// OAuth Account Types
// =============================================================================

export interface OAuthAccountData {
  provider: 'google' | 'github';
  providerAccountId: string;
  email: string;
  name: string;
  picture?: string;
}

/**
 * Normalize OAuth user info to common format
 */
export function normalizeGoogleUser(user: GoogleUserInfo): OAuthAccountData {
  return {
    provider: 'google',
    providerAccountId: user.id,
    email: user.email,
    name: user.name,
    picture: user.picture,
  };
}

/**
 * Normalize GitHub user info to common format
 */
export function normalizeGitHubUser(user: GitHubUserInfo): OAuthAccountData | null {
  if (!user.email) {
    return null; // Email required
  }

  return {
    provider: 'github',
    providerAccountId: String(user.id),
    email: user.email,
    name: user.name || user.login,
    picture: user.avatar_url,
  };
}
