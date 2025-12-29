/**
 * Session Authentication Middleware
 *
 * Validates session cookies for dashboard routes.
 * This is separate from API key authentication.
 */

import { createMiddleware } from 'hono/factory';
import { HTTPException } from 'hono/http-exception';
import type { Tenant } from './types.js';
import { validateSession } from '../services/session.js';
import { getTenantStore } from '../services/tenants.js';

// Context type augmentation for session auth
declare module 'hono' {
  interface ContextVariableMap {
    sessionTenant: Tenant;
    sessionId: string;
  }
}

/**
 * Session auth middleware - validates session cookie and injects tenant context
 *
 * Use this for dashboard routes that require a logged-in user.
 */
export const sessionAuthMiddleware = createMiddleware(async (c, next) => {
  const session = await validateSession(c);

  if (!session) {
    // For API requests, return JSON error
    const accept = c.req.header('Accept') || '';
    if (accept.includes('application/json')) {
      throw new HTTPException(401, {
        message: 'Session expired or invalid. Please log in again.',
      });
    }

    // For browser requests, redirect to login
    const currentPath = new URL(c.req.url).pathname;
    const redirectUrl = `/auth/login?redirect=${encodeURIComponent(currentPath)}`;
    return c.redirect(redirectUrl, 302);
  }

  // Get tenant from store
  const tenantStore = getTenantStore();
  if (!tenantStore) {
    throw new HTTPException(500, {
      message: 'Tenant store not configured',
    });
  }

  const tenant = await tenantStore.findById(session.tenantId);
  if (!tenant) {
    throw new HTTPException(401, {
      message: 'Account not found',
    });
  }

  // Set context variables
  c.set('sessionTenant', tenant);
  c.set('sessionId', session.sessionId);

  await next();
});

/**
 * Middleware to require verified email
 *
 * Use after sessionAuthMiddleware to block unverified accounts from certain pages.
 */
export const requireVerifiedEmail = createMiddleware(async (c, next) => {
  const tenant = c.get('sessionTenant');

  if (!tenant) {
    throw new HTTPException(500, {
      message: 'Session middleware must run before requireVerifiedEmail',
    });
  }

  if (!tenant.emailVerifiedAt) {
    // For API requests, return JSON error
    const accept = c.req.header('Accept') || '';
    if (accept.includes('application/json')) {
      throw new HTTPException(403, {
        message: 'Email verification required. Please check your email.',
      });
    }

    // For browser requests, redirect to verification required page
    return c.redirect('/auth/verify-email-required', 302);
  }

  await next();
});

/**
 * Optional session middleware - validates session if present but doesn't require it
 *
 * Use this for pages that work both logged in and logged out,
 * but want to show different content for authenticated users.
 */
export const optionalSessionMiddleware = createMiddleware(async (c, next) => {
  const session = await validateSession(c);

  if (session) {
    const tenantStore = getTenantStore();
    if (tenantStore) {
      const tenant = await tenantStore.findById(session.tenantId);
      if (tenant) {
        c.set('sessionTenant', tenant);
        c.set('sessionId', session.sessionId);
      }
    }
  }

  await next();
});
