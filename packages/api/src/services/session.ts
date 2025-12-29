/**
 * Session Service
 *
 * Manages user sessions for the dashboard (separate from API key auth).
 * Uses signed cookies for session tokens with Prisma backend.
 */

import { randomBytes, createHmac, timingSafeEqual } from 'crypto';
import type { Context } from 'hono';
import { setCookie, getCookie, deleteCookie } from 'hono/cookie';

const SESSION_COOKIE_NAME = 'unbrowser_session';
const SESSION_MAX_AGE = 7 * 24 * 60 * 60; // 7 days in seconds
const SESSION_MAX_AGE_MS = SESSION_MAX_AGE * 1000;

/**
 * Session store interface for database backend
 */
export interface SessionStore {
  create(
    tenantId: string,
    sessionToken: string,
    userAgent?: string,
    ipAddress?: string
  ): Promise<void>;
  validate(sessionToken: string): Promise<{ tenantId: string; id: string } | null>;
  delete(sessionToken: string): Promise<void>;
  deleteAllForTenant(tenantId: string): Promise<number>;
  updateActivity(sessionToken: string): Promise<void>;
  cleanupExpired(): Promise<number>;
}

// Session store instance
let sessionStore: SessionStore | null = null;

/**
 * Set the session store implementation
 */
export function setSessionStore(store: SessionStore): void {
  sessionStore = store;
}

/**
 * Get the current session store
 */
export function getSessionStore(): SessionStore | null {
  return sessionStore;
}

/**
 * Generate a cryptographically secure session token
 */
export function generateSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Get the session secret
 */
function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error('SESSION_SECRET not configured');
  }
  return secret;
}

/**
 * Sign a session token with HMAC-SHA256
 *
 * Format: token.signature
 */
export function signToken(token: string): string {
  const secret = getSessionSecret();
  const signature = createHmac('sha256', secret).update(token).digest('base64url');
  return `${token}.${signature}`;
}

/**
 * Verify and extract a signed token
 *
 * Returns the original token if valid, null if invalid.
 * Uses timing-safe comparison to prevent timing attacks.
 */
export function verifySignedToken(signedToken: string): string | null {
  const parts = signedToken.split('.');
  if (parts.length !== 2) return null;

  const [token, signature] = parts;

  try {
    const secret = getSessionSecret();
    const expectedSignature = createHmac('sha256', secret).update(token).digest('base64url');

    // Timing-safe comparison
    const sigBuffer = Buffer.from(signature, 'base64url');
    const expectedBuffer = Buffer.from(expectedSignature, 'base64url');

    if (sigBuffer.length !== expectedBuffer.length) return null;
    if (!timingSafeEqual(sigBuffer, expectedBuffer)) return null;

    return token;
  } catch {
    return null;
  }
}

/**
 * Set the session cookie on the response
 */
export function setSessionCookie(c: Context, signedToken: string): void {
  setCookie(c, SESSION_COOKIE_NAME, signedToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'Lax',
    maxAge: SESSION_MAX_AGE,
    path: '/',
  });
}

/**
 * Get the session cookie from the request
 */
export function getSessionCookie(c: Context): string | undefined {
  return getCookie(c, SESSION_COOKIE_NAME);
}

/**
 * Clear the session cookie
 */
export function clearSessionCookie(c: Context): void {
  deleteCookie(c, SESSION_COOKIE_NAME, { path: '/' });
}

/**
 * Create a new session and set the cookie
 *
 * Returns the session token (unsigned, for database storage)
 */
export async function createSession(
  c: Context,
  tenantId: string
): Promise<string> {
  const store = getSessionStore();
  if (!store) {
    throw new Error('Session store not configured');
  }

  const sessionToken = generateSessionToken();
  const userAgent = c.req.header('User-Agent');
  const ipAddress =
    c.req.header('X-Forwarded-For')?.split(',')[0].trim() ||
    c.req.header('X-Real-IP') ||
    undefined;

  // Store session in database
  await store.create(tenantId, sessionToken, userAgent, ipAddress);

  // Sign and set cookie
  const signedToken = signToken(sessionToken);
  setSessionCookie(c, signedToken);

  return sessionToken;
}

/**
 * Validate the current session from cookie
 *
 * Returns tenant ID and session ID if valid, null otherwise.
 */
export async function validateSession(
  c: Context
): Promise<{ tenantId: string; sessionId: string } | null> {
  const signedToken = getSessionCookie(c);
  if (!signedToken) return null;

  const sessionToken = verifySignedToken(signedToken);
  if (!sessionToken) return null;

  const store = getSessionStore();
  if (!store) return null;

  const session = await store.validate(sessionToken);
  if (!session) return null;

  // Update activity timestamp (fire and forget)
  store.updateActivity(sessionToken).catch(() => {
    // Ignore errors from activity tracking
  });

  return { tenantId: session.tenantId, sessionId: session.id };
}

/**
 * Destroy the current session
 */
export async function destroySession(c: Context): Promise<void> {
  const signedToken = getSessionCookie(c);
  if (signedToken) {
    const sessionToken = verifySignedToken(signedToken);
    if (sessionToken) {
      const store = getSessionStore();
      if (store) {
        await store.delete(sessionToken);
      }
    }
  }

  clearSessionCookie(c);
}

/**
 * Get session expiry date
 */
export function getSessionExpiryDate(): Date {
  return new Date(Date.now() + SESSION_MAX_AGE_MS);
}
