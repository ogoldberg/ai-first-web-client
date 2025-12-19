import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SessionCrypto, sessionCrypto } from '../../src/utils/session-crypto.js';

describe('SessionCrypto', () => {
  const originalEnv = process.env;
  const testPassword = 'test-secure-password-123';

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  describe('Initialization', () => {
    it('should be disabled when no key is set', () => {
      delete process.env.LLM_BROWSER_SESSION_KEY;
      const crypto = new SessionCrypto();

      expect(crypto.isEnabled()).toBe(false);
    });

    it('should be enabled when key is set', () => {
      process.env.LLM_BROWSER_SESSION_KEY = testPassword;
      const crypto = new SessionCrypto();

      expect(crypto.isEnabled()).toBe(true);
    });

    it('should be disabled when key is too short', () => {
      process.env.LLM_BROWSER_SESSION_KEY = 'short';
      const crypto = new SessionCrypto();

      expect(crypto.isEnabled()).toBe(false);
    });

    it('should return correct env var name', () => {
      const crypto = new SessionCrypto();
      expect(crypto.getEnvVarName()).toBe('LLM_BROWSER_SESSION_KEY');
    });
  });

  describe('Encryption', () => {
    it('should return plaintext when encryption is disabled', () => {
      delete process.env.LLM_BROWSER_SESSION_KEY;
      const crypto = new SessionCrypto();
      const plaintext = '{"test": "data"}';

      const result = crypto.encrypt(plaintext);

      expect(result).toBe(plaintext);
    });

    it('should encrypt data when enabled', () => {
      process.env.LLM_BROWSER_SESSION_KEY = testPassword;
      const crypto = new SessionCrypto();
      const plaintext = '{"test": "data"}';

      const result = crypto.encrypt(plaintext);

      expect(result).not.toBe(plaintext);
      expect(crypto.isEncrypted(result)).toBe(true);
    });

    it('should produce different ciphertext for same plaintext (random IV)', () => {
      process.env.LLM_BROWSER_SESSION_KEY = testPassword;
      const crypto = new SessionCrypto();
      const plaintext = '{"test": "data"}';

      const result1 = crypto.encrypt(plaintext);
      const result2 = crypto.encrypt(plaintext);

      expect(result1).not.toBe(result2);
    });

    it('should handle large data', () => {
      process.env.LLM_BROWSER_SESSION_KEY = testPassword;
      const crypto = new SessionCrypto();
      const largeData = JSON.stringify({
        cookies: Array(100)
          .fill(null)
          .map((_, i) => ({
            name: `cookie_${i}`,
            value: 'x'.repeat(100),
            domain: 'example.com',
          })),
        localStorage: Object.fromEntries(
          Array(50)
            .fill(null)
            .map((_, i) => [`key_${i}`, 'value'.repeat(50)])
        ),
      });

      const encrypted = crypto.encrypt(largeData);
      const decrypted = crypto.decrypt(encrypted);

      expect(decrypted).toBe(largeData);
    });

    it('should handle special characters and unicode', () => {
      process.env.LLM_BROWSER_SESSION_KEY = testPassword;
      const crypto = new SessionCrypto();
      const plaintext = JSON.stringify({
        unicode: 'Hello world',
        special: '!@#$%^&*()_+-=[]{}|;:,.<>?',
        newlines: 'line1\nline2\r\nline3',
      });

      const encrypted = crypto.encrypt(plaintext);
      const decrypted = crypto.decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });
  });

  describe('Decryption', () => {
    it('should return plaintext if not encrypted', () => {
      process.env.LLM_BROWSER_SESSION_KEY = testPassword;
      const crypto = new SessionCrypto();
      const plaintext = '{"test": "data"}';

      const result = crypto.decrypt(plaintext);

      expect(result).toBe(plaintext);
    });

    it('should decrypt encrypted data', () => {
      process.env.LLM_BROWSER_SESSION_KEY = testPassword;
      const crypto = new SessionCrypto();
      const plaintext = '{"test": "data", "number": 42}';

      const encrypted = crypto.encrypt(plaintext);
      const decrypted = crypto.decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it('should throw when trying to decrypt with wrong key', () => {
      process.env.LLM_BROWSER_SESSION_KEY = testPassword;
      const crypto1 = new SessionCrypto();
      const plaintext = '{"test": "data"}';

      const encrypted = crypto1.encrypt(plaintext);

      // Change the key
      process.env.LLM_BROWSER_SESSION_KEY = 'different-password';
      const crypto2 = new SessionCrypto();

      expect(() => crypto2.decrypt(encrypted)).toThrow(/invalid key|corrupted/i);
    });

    it('should throw when key is missing for encrypted data', () => {
      process.env.LLM_BROWSER_SESSION_KEY = testPassword;
      const crypto1 = new SessionCrypto();
      const plaintext = '{"test": "data"}';

      const encrypted = crypto1.encrypt(plaintext);

      // Remove the key
      delete process.env.LLM_BROWSER_SESSION_KEY;
      const crypto2 = new SessionCrypto();

      expect(() => crypto2.decrypt(encrypted)).toThrow(/LLM_BROWSER_SESSION_KEY not set/);
    });

    it('should throw for invalid encrypted format', () => {
      process.env.LLM_BROWSER_SESSION_KEY = testPassword;
      const crypto = new SessionCrypto();

      const invalidPayload = JSON.stringify({
        header: 'LLMB_ENC_V1',
        salt: 'invalid',
        iv: 'invalid',
        authTag: 'invalid',
        ciphertext: 'invalid',
      });

      expect(() => crypto.decrypt(invalidPayload)).toThrow();
    });
  });

  describe('isEncrypted', () => {
    it('should return false for plaintext JSON', () => {
      const crypto = new SessionCrypto();

      expect(crypto.isEncrypted('{"test": "data"}')).toBe(false);
    });

    it('should return false for non-JSON', () => {
      const crypto = new SessionCrypto();

      expect(crypto.isEncrypted('not json')).toBe(false);
    });

    it('should return true for encrypted data', () => {
      process.env.LLM_BROWSER_SESSION_KEY = testPassword;
      const crypto = new SessionCrypto();
      const encrypted = crypto.encrypt('{"test": "data"}');

      expect(crypto.isEncrypted(encrypted)).toBe(true);
    });

    it('should return false for JSON with wrong header', () => {
      const crypto = new SessionCrypto();
      const fakeEncrypted = JSON.stringify({
        header: 'WRONG_HEADER',
        salt: 'xxx',
      });

      expect(crypto.isEncrypted(fakeEncrypted)).toBe(false);
    });
  });

  describe('Re-encryption', () => {
    it('should re-encrypt data with new password', () => {
      process.env.LLM_BROWSER_SESSION_KEY = testPassword;
      const crypto = new SessionCrypto();
      const plaintext = '{"test": "data"}';

      // Encrypt with original password
      const encrypted = crypto.encrypt(plaintext);

      // Re-encrypt with new password
      const newPassword = 'new-secure-password-456';
      const reencrypted = crypto.reencrypt(encrypted, newPassword);

      // Verify the re-encrypted data is different
      expect(reencrypted).not.toBe(encrypted);

      // Verify we can decrypt with new password
      process.env.LLM_BROWSER_SESSION_KEY = newPassword;
      const crypto2 = new SessionCrypto();
      const decrypted = crypto2.decrypt(reencrypted);

      expect(decrypted).toBe(plaintext);
    });

    it('should handle unencrypted data in reencrypt', () => {
      delete process.env.LLM_BROWSER_SESSION_KEY;
      const crypto = new SessionCrypto();
      const plaintext = '{"test": "data"}';

      // Re-encrypt unencrypted data
      const newPassword = 'new-secure-password-456';
      const encrypted = crypto.reencrypt(plaintext, newPassword);

      // Verify we can decrypt with new password
      process.env.LLM_BROWSER_SESSION_KEY = newPassword;
      const crypto2 = new SessionCrypto();
      const decrypted = crypto2.decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });
  });

  describe('Edge cases', () => {
    it('should handle empty string', () => {
      process.env.LLM_BROWSER_SESSION_KEY = testPassword;
      const crypto = new SessionCrypto();

      const encrypted = crypto.encrypt('');
      const decrypted = crypto.decrypt(encrypted);

      expect(decrypted).toBe('');
    });

    it('should handle very long passwords', () => {
      process.env.LLM_BROWSER_SESSION_KEY = 'x'.repeat(1000);
      const crypto = new SessionCrypto();
      const plaintext = '{"test": "data"}';

      const encrypted = crypto.encrypt(plaintext);
      const decrypted = crypto.decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it('should handle minimum valid password length (8 chars)', () => {
      process.env.LLM_BROWSER_SESSION_KEY = '12345678';
      const crypto = new SessionCrypto();

      expect(crypto.isEnabled()).toBe(true);

      const plaintext = '{"test": "data"}';
      const encrypted = crypto.encrypt(plaintext);
      const decrypted = crypto.decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });
  });

  describe('Singleton', () => {
    it('should export a singleton instance', () => {
      expect(sessionCrypto).toBeInstanceOf(SessionCrypto);
    });
  });
});
