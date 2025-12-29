/**
 * Password Service
 *
 * Secure password hashing using Argon2id (winner of the Password Hashing Competition).
 * Provides password strength validation and secure comparison.
 */

import argon2 from 'argon2';

/**
 * Hash a password using Argon2id
 *
 * Configuration follows OWASP recommendations:
 * - Memory: 64MB (65536 KiB)
 * - Time: 3 iterations
 * - Parallelism: 4 threads
 */
export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65536, // 64MB
    timeCost: 3,
    parallelism: 4,
  });
}

/**
 * Verify a password against its hash
 *
 * Uses timing-safe comparison to prevent timing attacks.
 */
export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    // Invalid hash format or other error
    return false;
  }
}

/**
 * Password strength validation result
 */
export interface PasswordValidationResult {
  valid: boolean;
  errors: string[];
  strength: 'weak' | 'fair' | 'good' | 'strong';
}

/**
 * Validate password strength
 *
 * Requirements:
 * - Minimum 8 characters
 * - At least one uppercase letter
 * - At least one lowercase letter
 * - At least one number
 *
 * Bonus (improves strength rating):
 * - 12+ characters
 * - Special characters
 */
export function validatePasswordStrength(password: string): PasswordValidationResult {
  const errors: string[] = [];
  let score = 0;

  // Required checks
  if (password.length < 8) {
    errors.push('Password must be at least 8 characters');
  } else {
    score += 1;
    if (password.length >= 12) score += 1;
    if (password.length >= 16) score += 1;
  }

  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  } else {
    score += 1;
  }

  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  } else {
    score += 1;
  }

  if (!/[0-9]/.test(password)) {
    errors.push('Password must contain at least one number');
  } else {
    score += 1;
  }

  // Bonus: special characters
  if (/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    score += 1;
  }

  // Determine strength
  let strength: 'weak' | 'fair' | 'good' | 'strong';
  if (score <= 3) {
    strength = 'weak';
  } else if (score <= 4) {
    strength = 'fair';
  } else if (score <= 5) {
    strength = 'good';
  } else {
    strength = 'strong';
  }

  return {
    valid: errors.length === 0,
    errors,
    strength,
  };
}

/**
 * Check if a password needs rehashing
 *
 * Returns true if the hash was created with older/weaker parameters
 * and should be rehashed on next successful login.
 */
export function needsRehash(hash: string): boolean {
  return argon2.needsRehash(hash, {
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  });
}
