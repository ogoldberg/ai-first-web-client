/**
 * Session Crypto - Encrypts and decrypts session data at rest
 *
 * Uses AES-256-GCM for authenticated encryption with:
 * - PBKDF2 key derivation from user-supplied password
 * - Random IV for each encryption
 * - Authentication tag for integrity verification
 *
 * Environment variable: LLM_BROWSER_SESSION_KEY
 * - If set, sessions are encrypted before saving and decrypted on load
 * - If not set, sessions are stored in plaintext (backward compatible)
 */

import { createCipheriv, createDecipheriv, randomBytes, pbkdf2Sync } from 'crypto';
import { logger } from './logger.js';

/** Algorithm for encryption */
const ALGORITHM = 'aes-256-gcm';

/** Key length in bytes (256 bits) */
const KEY_LENGTH = 32;

/** IV length in bytes (96 bits recommended for GCM) */
const IV_LENGTH = 12;

/** Auth tag length in bytes (128 bits) */
const AUTH_TAG_LENGTH = 16;

/** Salt length in bytes */
const SALT_LENGTH = 16;

/** PBKDF2 iterations (high for security, but not too slow) */
const PBKDF2_ITERATIONS = 100000;

/** Environment variable name for encryption key */
const ENV_VAR_NAME = 'LLM_BROWSER_SESSION_KEY';

/** Header to identify encrypted files */
const ENCRYPTED_HEADER = 'LLMB_ENC_V1';

/**
 * Encrypted data format:
 * - Header: "LLMB_ENC_V1" (11 bytes)
 * - Salt: 16 bytes (for PBKDF2)
 * - IV: 12 bytes
 * - Auth Tag: 16 bytes
 * - Ciphertext: variable length
 */
interface EncryptedPayload {
  header: string;
  salt: string; // base64
  iv: string; // base64
  authTag: string; // base64
  ciphertext: string; // base64
}

/**
 * Session crypto manager
 * Handles encryption/decryption of session data using AES-256-GCM
 */
export class SessionCrypto {
  private key: Buffer | null = null;
  private salt: Buffer | null = null;

  constructor() {
    this.initializeFromEnv();
  }

  /**
   * Check if encryption is enabled (key is set)
   */
  isEnabled(): boolean {
    return this.key !== null;
  }

  /**
   * Get the environment variable name for the encryption key
   */
  getEnvVarName(): string {
    return ENV_VAR_NAME;
  }

  /**
   * Initialize encryption key from environment variable
   */
  private initializeFromEnv(): void {
    const password = process.env[ENV_VAR_NAME];

    if (!password) {
      logger.session.debug('Session encryption disabled (no key configured)');
      return;
    }

    if (password.length < 8) {
      logger.session.warn('Session encryption key too short (min 8 chars), encryption disabled');
      return;
    }

    // Generate a fixed salt for this instance (stored with each encrypted file)
    // Each encryption gets a random salt, but we need a key for memory
    this.salt = randomBytes(SALT_LENGTH);
    this.key = this.deriveKey(password, this.salt);

    logger.session.info('Session encryption enabled');
  }

  /**
   * Derive encryption key from password using PBKDF2
   */
  private deriveKey(password: string, salt: Buffer): Buffer {
    return pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, KEY_LENGTH, 'sha256');
  }

  /**
   * Encrypt plaintext data
   * Returns encrypted payload as JSON string, or original if encryption disabled
   */
  encrypt(plaintext: string): string {
    if (!this.isEnabled()) {
      return plaintext;
    }

    const password = process.env[ENV_VAR_NAME]!;

    // Generate random salt and IV for this encryption
    const salt = randomBytes(SALT_LENGTH);
    const iv = randomBytes(IV_LENGTH);

    // Derive key from password with this salt
    const key = this.deriveKey(password, salt);

    // Create cipher and encrypt
    const cipher = createCipheriv(ALGORITHM, key, iv);
    let ciphertext = cipher.update(plaintext, 'utf8', 'base64');
    ciphertext += cipher.final('base64');

    // Get auth tag
    const authTag = cipher.getAuthTag();

    // Create encrypted payload
    const payload: EncryptedPayload = {
      header: ENCRYPTED_HEADER,
      salt: salt.toString('base64'),
      iv: iv.toString('base64'),
      authTag: authTag.toString('base64'),
      ciphertext,
    };

    return JSON.stringify(payload);
  }

  /**
   * Decrypt encrypted data
   * Returns decrypted plaintext, or original if not encrypted
   */
  decrypt(data: string): string {
    // Check if data is encrypted (starts with JSON containing our header)
    if (!this.isEncrypted(data)) {
      return data;
    }

    const password = process.env[ENV_VAR_NAME];

    if (!password) {
      throw new Error(
        `Session is encrypted but ${ENV_VAR_NAME} not set. ` +
          'Set the environment variable to decrypt sessions.'
      );
    }

    try {
      const payload: EncryptedPayload = JSON.parse(data);

      // Verify header
      if (payload.header !== ENCRYPTED_HEADER) {
        throw new Error('Invalid encrypted session format');
      }

      // Decode components
      const salt = Buffer.from(payload.salt, 'base64');
      const iv = Buffer.from(payload.iv, 'base64');
      const authTag = Buffer.from(payload.authTag, 'base64');
      const ciphertext = Buffer.from(payload.ciphertext, 'base64');

      // Derive key from password with stored salt
      const key = this.deriveKey(password, salt);

      // Create decipher
      const decipher = createDecipheriv(ALGORITHM, key, iv);
      decipher.setAuthTag(authTag);

      // Decrypt
      let plaintext = decipher.update(ciphertext);
      plaintext = Buffer.concat([plaintext, decipher.final()]);

      return plaintext.toString('utf8');
    } catch (error) {
      if (error instanceof Error && error.message.includes('Unsupported state')) {
        throw new Error(
          'Failed to decrypt session: invalid key or corrupted data. ' +
            'Ensure the correct encryption key is set.'
        );
      }
      throw error;
    }
  }

  /**
   * Check if data appears to be encrypted
   */
  isEncrypted(data: string): boolean {
    if (!data.startsWith('{')) {
      return false;
    }

    try {
      const parsed = JSON.parse(data);
      return parsed.header === ENCRYPTED_HEADER;
    } catch {
      return false;
    }
  }

  /**
   * Re-encrypt data with a new key (for key rotation)
   * Decrypts with current key, re-encrypts with new key
   */
  reencrypt(data: string, newPassword: string): string {
    // First decrypt with current key
    const plaintext = this.decrypt(data);

    // Generate new salt and IV
    const salt = randomBytes(SALT_LENGTH);
    const iv = randomBytes(IV_LENGTH);

    // Derive new key
    const newKey = this.deriveKey(newPassword, salt);

    // Encrypt with new key
    const cipher = createCipheriv(ALGORITHM, newKey, iv);
    let ciphertext = cipher.update(plaintext, 'utf8', 'base64');
    ciphertext += cipher.final('base64');

    const authTag = cipher.getAuthTag();

    const payload: EncryptedPayload = {
      header: ENCRYPTED_HEADER,
      salt: salt.toString('base64'),
      iv: iv.toString('base64'),
      authTag: authTag.toString('base64'),
      ciphertext,
    };

    return JSON.stringify(payload);
  }
}

/**
 * Singleton instance for global use
 */
export const sessionCrypto = new SessionCrypto();
