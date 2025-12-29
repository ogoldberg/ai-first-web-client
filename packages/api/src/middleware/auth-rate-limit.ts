/**
 * Auth Rate Limiting Middleware
 *
 * Prevents brute force attacks on authentication endpoints.
 * Uses IP-based rate limiting for:
 * - Login attempts
 * - Signup attempts
 * - Password reset requests
 */

import { createMiddleware } from 'hono/factory';
import { HTTPException } from 'hono/http-exception';

// Rate limit configuration
const AUTH_LIMITS = {
  login: {
    maxAttempts: 5,
    windowMs: 15 * 60 * 1000, // 15 minutes
    blockDurationMs: 15 * 60 * 1000, // 15 minutes
  },
  signup: {
    maxAttempts: 3,
    windowMs: 60 * 60 * 1000, // 1 hour
    blockDurationMs: 60 * 60 * 1000, // 1 hour
  },
  passwordReset: {
    maxAttempts: 3,
    windowMs: 60 * 60 * 1000, // 1 hour
    blockDurationMs: 60 * 60 * 1000, // 1 hour
  },
  verifyEmail: {
    maxAttempts: 5,
    windowMs: 15 * 60 * 1000, // 15 minutes
    blockDurationMs: 15 * 60 * 1000, // 15 minutes
  },
};

type AuthLimitType = keyof typeof AUTH_LIMITS;

interface RateLimitEntry {
  attempts: number;
  firstAttempt: number;
  blockedUntil?: number;
}

// In-memory store for rate limits
// In production, use Redis for multi-instance deployments
const rateLimitStore = new Map<string, RateLimitEntry>();

// Cleanup expired entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    const config = AUTH_LIMITS[key.split(':')[0] as AuthLimitType] || AUTH_LIMITS.login;
    // Remove entries where window has completely expired
    if (now - entry.firstAttempt > config.windowMs * 2) {
      rateLimitStore.delete(key);
    }
  }
}, 5 * 60 * 1000);

/**
 * Get client IP address from request
 */
function getClientIP(c: { req: { header: (name: string) => string | undefined } }): string {
  // Check standard proxy headers
  const forwarded = c.req.header('X-Forwarded-For');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }

  const realIp = c.req.header('X-Real-IP');
  if (realIp) {
    return realIp;
  }

  // Fallback to unknown
  return 'unknown';
}

/**
 * Check rate limit for a specific action
 *
 * Returns { allowed: true } if under limit, or { allowed: false, retryAfter } if blocked
 */
function checkRateLimit(
  limitType: AuthLimitType,
  ip: string
): { allowed: true } | { allowed: false; retryAfter: number } {
  const config = AUTH_LIMITS[limitType];
  const key = `${limitType}:${ip}`;
  const now = Date.now();

  let entry = rateLimitStore.get(key);

  // Check if blocked
  if (entry?.blockedUntil && now < entry.blockedUntil) {
    return {
      allowed: false,
      retryAfter: Math.ceil((entry.blockedUntil - now) / 1000),
    };
  }

  // Check if window has expired
  if (entry && now - entry.firstAttempt > config.windowMs) {
    // Window expired, reset
    entry = undefined;
    rateLimitStore.delete(key);
  }

  // If no entry or window expired, allow
  if (!entry) {
    return { allowed: true };
  }

  // Check if over limit
  if (entry.attempts >= config.maxAttempts) {
    // Block the IP
    entry.blockedUntil = now + config.blockDurationMs;
    rateLimitStore.set(key, entry);

    return {
      allowed: false,
      retryAfter: Math.ceil(config.blockDurationMs / 1000),
    };
  }

  return { allowed: true };
}

/**
 * Record an attempt for rate limiting
 */
function recordAttempt(limitType: AuthLimitType, ip: string): void {
  const key = `${limitType}:${ip}`;
  const now = Date.now();

  const entry = rateLimitStore.get(key);

  if (!entry) {
    rateLimitStore.set(key, {
      attempts: 1,
      firstAttempt: now,
    });
  } else {
    entry.attempts++;
    rateLimitStore.set(key, entry);
  }
}

/**
 * Clear rate limit for a specific IP (e.g., after successful login)
 */
export function clearRateLimit(limitType: AuthLimitType, ip: string): void {
  const key = `${limitType}:${ip}`;
  rateLimitStore.delete(key);
}

/**
 * Create rate limit middleware for a specific auth action
 */
function createAuthRateLimit(limitType: AuthLimitType) {
  return createMiddleware(async (c, next) => {
    const ip = getClientIP(c);
    const result = checkRateLimit(limitType, ip);

    if (!result.allowed) {
      c.header('Retry-After', result.retryAfter.toString());
      throw new HTTPException(429, {
        message: `Too many attempts. Please try again in ${Math.ceil(result.retryAfter / 60)} minutes.`,
      });
    }

    // Record this attempt
    recordAttempt(limitType, ip);

    await next();
  });
}

/**
 * Login rate limit middleware
 * 5 attempts per 15 minutes per IP
 */
export const loginRateLimit = createAuthRateLimit('login');

/**
 * Signup rate limit middleware
 * 3 signups per hour per IP
 */
export const signupRateLimit = createAuthRateLimit('signup');

/**
 * Password reset rate limit middleware
 * 3 requests per hour per IP
 */
export const passwordResetRateLimit = createAuthRateLimit('passwordReset');

/**
 * Email verification rate limit middleware
 * 5 attempts per 15 minutes per IP
 */
export const verifyEmailRateLimit = createAuthRateLimit('verifyEmail');

/**
 * Get client IP helper (exported for use in auth routes)
 */
export { getClientIP };
