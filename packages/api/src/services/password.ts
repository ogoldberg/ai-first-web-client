/**
 * Password Service
 *
 * Secure password hashing using Node.js built-in crypto.scrypt.
 * This avoids native module dependencies that can cause issues in some environments.
 * Provides password strength validation and secure comparison.
 */

import { scrypt, randomBytes, timingSafeEqual, ScryptOptions } from 'crypto';

// Scrypt parameters (N=2^14, r=8, p=1 is recommended for interactive logins)
const SCRYPT_KEYLEN = 64;
const SCRYPT_OPTIONS: ScryptOptions = {
  N: 16384, // Cost parameter (2^14)
  r: 8, // Block size
  p: 1, // Parallelization
};

/**
 * Promisified scrypt with options
 */
function scryptAsync(
  password: string,
  salt: Buffer,
  keylen: number,
  options: ScryptOptions
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keylen, options, (err, derivedKey) => {
      if (err) {
        reject(err);
      } else {
        resolve(derivedKey);
      }
    });
  });
}

/**
 * Hash a password using scrypt
 *
 * Returns a string in format: salt:hash (both hex-encoded)
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(32);
  const hash = await scryptAsync(password, salt, SCRYPT_KEYLEN, SCRYPT_OPTIONS);

  return `${salt.toString('hex')}:${hash.toString('hex')}`;
}

/**
 * Verify a password against its hash
 *
 * Uses timing-safe comparison to prevent timing attacks.
 */
export async function verifyPassword(storedHash: string, password: string): Promise<boolean> {
  try {
    const [saltHex, hashHex] = storedHash.split(':');
    if (!saltHex || !hashHex) {
      return false;
    }

    const salt = Buffer.from(saltHex, 'hex');
    const storedHashBuffer = Buffer.from(hashHex, 'hex');

    const hash = await scryptAsync(password, salt, SCRYPT_KEYLEN, SCRYPT_OPTIONS);

    return timingSafeEqual(storedHashBuffer, hash);
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
 * For scrypt, we check if the hash format is valid.
 * Future: could add version checking for parameter upgrades.
 */
export function needsRehash(hash: string): boolean {
  // Check if hash is in our expected format
  const [saltHex, hashHex] = hash.split(':');
  if (!saltHex || !hashHex) {
    return true; // Invalid format, needs rehash
  }

  // Check expected lengths (32 bytes salt = 64 hex chars, 64 bytes hash = 128 hex chars)
  if (saltHex.length !== 64 || hashHex.length !== 128) {
    return true;
  }

  return false;
}
