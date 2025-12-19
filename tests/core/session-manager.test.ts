import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { SessionManager, type SessionHealth } from '../../src/core/session-manager.js';
import type { BrowserContext } from 'playwright';
import { promises as fs } from 'fs';
import path from 'path';
import { SessionCrypto } from '../../src/utils/session-crypto.js';

// Mock fs module
vi.mock('fs', async () => {
  const actual = await vi.importActual('fs');
  return {
    ...actual,
    promises: {
      mkdir: vi.fn().mockResolvedValue(undefined),
      readdir: vi.fn().mockResolvedValue([]),
      readFile: vi.fn(),
      writeFile: vi.fn().mockResolvedValue(undefined),
      rename: vi.fn().mockResolvedValue(undefined),
      unlink: vi.fn().mockResolvedValue(undefined),
    },
  };
});

describe('SessionManager', () => {
  let sessionManager: SessionManager;
  const testSessionsDir = './test-sessions';

  beforeEach(async () => {
    vi.resetAllMocks();
    sessionManager = new SessionManager(testSessionsDir);
    await sessionManager.initialize();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Session Health Detection', () => {
    const createMockSession = (overrides: any = {}) => ({
      domain: 'example.com',
      cookies: [],
      localStorage: {},
      sessionStorage: {},
      isAuthenticated: true,
      lastUsed: Date.now(),
      ...overrides,
    });

    const createMockCookie = (name: string, expiresInSeconds: number | null) => ({
      name,
      value: 'test-value',
      domain: 'example.com',
      path: '/',
      expires: expiresInSeconds === null ? -1 : Math.floor(Date.now() / 1000) + expiresInSeconds,
      httpOnly: true,
      secure: true,
      sameSite: 'Lax' as const,
    });

    it('should return not_found for non-existent session', () => {
      const health = sessionManager.getSessionHealth('nonexistent.com');

      expect(health.status).toBe('not_found');
      expect(health.domain).toBe('nonexistent.com');
      expect(health.profile).toBe('default');
      expect(health.isAuthenticated).toBe(false);
    });

    it('should return healthy for valid session with non-expired cookies', async () => {
      // Manually add a session to the internal Map
      const session = createMockSession({
        cookies: [
          createMockCookie('session_id', 86400 * 2), // expires in 48 hours (beyond 24h threshold)
          createMockCookie('auth_token', 86400 * 7), // expires in 7 days
        ],
      });

      // Access private sessions Map through type assertion
      const sessions = (sessionManager as any).sessions;
      sessions.set('example.com:default', session);

      const health = sessionManager.getSessionHealth('example.com');

      expect(health.status).toBe('healthy');
      expect(health.isAuthenticated).toBe(true);
      expect(health.totalCookies).toBe(2);
      expect(health.expiredCookies).toBe(0);
    });

    it('should return expired when auth cookies have expired', async () => {
      const session = createMockSession({
        cookies: [
          createMockCookie('session_id', -3600), // expired 1 hour ago
          createMockCookie('auth_token', -7200), // expired 2 hours ago
        ],
      });

      const sessions = (sessionManager as any).sessions;
      sessions.set('example.com:default', session);

      const health = sessionManager.getSessionHealth('example.com');

      expect(health.status).toBe('expired');
      expect(health.expiredCookies).toBe(2);
      expect(health.isAuthenticated).toBe(false);
    });

    it('should return expiring_soon when auth cookies expire within 24 hours', async () => {
      const session = createMockSession({
        cookies: [
          createMockCookie('session_id', 3600), // expires in 1 hour
          createMockCookie('regular_cookie', 86400 * 30), // expires in 30 days (not auth cookie)
        ],
      });

      const sessions = (sessionManager as any).sessions;
      sessions.set('example.com:default', session);

      const health = sessionManager.getSessionHealth('example.com');

      expect(health.status).toBe('expiring_soon');
      expect(health.expiresInMs).toBeDefined();
      expect(health.expiresInMs!).toBeLessThanOrEqual(24 * 60 * 60 * 1000);
    });

    it('should return stale for sessions unused for 30+ days', async () => {
      const thirtyOneDaysAgo = Date.now() - 31 * 24 * 60 * 60 * 1000;
      const session = createMockSession({
        cookies: [createMockCookie('session_id', 86400 * 365)], // valid cookie
        lastUsed: thirtyOneDaysAgo,
      });

      const sessions = (sessionManager as any).sessions;
      sessions.set('example.com:default', session);

      const health = sessionManager.getSessionHealth('example.com');

      expect(health.status).toBe('stale');
      expect(health.staleDays).toBeGreaterThanOrEqual(30);
    });

    it('should handle session cookies (no expiry) correctly', async () => {
      const session = createMockSession({
        cookies: [
          createMockCookie('session_id', null), // session cookie (no expiry)
          createMockCookie('csrf_token', null), // another session cookie
        ],
      });

      const sessions = (sessionManager as any).sessions;
      sessions.set('example.com:default', session);

      const health = sessionManager.getSessionHealth('example.com');

      // Session cookies should not count as expired
      expect(health.status).toBe('healthy');
      expect(health.expiredCookies).toBe(0);
    });

    it('should check isSessionExpired correctly', async () => {
      const sessions = (sessionManager as any).sessions;

      // Non-existent session
      expect(sessionManager.isSessionExpired('nonexistent.com')).toBe(true);

      // Valid session
      sessions.set('valid.com:default', createMockSession({
        domain: 'valid.com',
        cookies: [createMockCookie('session_id', 86400)],
      }));
      expect(sessionManager.isSessionExpired('valid.com')).toBe(false);

      // Expired session
      sessions.set('expired.com:default', createMockSession({
        domain: 'expired.com',
        cookies: [createMockCookie('auth_token', -3600)],
      }));
      expect(sessionManager.isSessionExpired('expired.com')).toBe(true);
    });
  });

  describe('Session Auto-Refresh', () => {
    it('should return false when no refresh callback is registered', async () => {
      const sessions = (sessionManager as any).sessions;
      sessions.set('example.com:default', {
        domain: 'example.com',
        cookies: [{ name: 'auth_token', expires: Math.floor(Date.now() / 1000) - 3600 }],
        localStorage: {},
        sessionStorage: {},
        isAuthenticated: true,
        lastUsed: Date.now(),
      });

      const result = await sessionManager.refreshSession('example.com');
      expect(result).toBe(false);
    });

    it('should call refresh callback for expired sessions', async () => {
      const mockRefreshCallback = vi.fn().mockResolvedValue(true);
      sessionManager.setRefreshCallback(mockRefreshCallback);

      const sessions = (sessionManager as any).sessions;
      sessions.set('example.com:default', {
        domain: 'example.com',
        cookies: [{ name: 'auth_token', expires: Math.floor(Date.now() / 1000) - 3600 }],
        localStorage: {},
        sessionStorage: {},
        isAuthenticated: true,
        lastUsed: Date.now(),
      });

      const result = await sessionManager.refreshSession('example.com');

      expect(mockRefreshCallback).toHaveBeenCalledWith('example.com', 'default');
      expect(result).toBe(true);
    });

    it('should return true without calling callback for healthy sessions', async () => {
      const mockRefreshCallback = vi.fn().mockResolvedValue(true);
      sessionManager.setRefreshCallback(mockRefreshCallback);

      const sessions = (sessionManager as any).sessions;
      sessions.set('example.com:default', {
        domain: 'example.com',
        cookies: [{ name: 'session_id', expires: Math.floor(Date.now() / 1000) + 86400 * 7 }],
        localStorage: {},
        sessionStorage: {},
        isAuthenticated: true,
        lastUsed: Date.now(),
      });

      const result = await sessionManager.refreshSession('example.com');

      expect(mockRefreshCallback).not.toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('should handle refresh callback errors gracefully', async () => {
      const mockRefreshCallback = vi.fn().mockRejectedValue(new Error('Auth failed'));
      sessionManager.setRefreshCallback(mockRefreshCallback);

      const sessions = (sessionManager as any).sessions;
      sessions.set('example.com:default', {
        domain: 'example.com',
        cookies: [{ name: 'auth_token', expires: Math.floor(Date.now() / 1000) - 3600 }],
        localStorage: {},
        sessionStorage: {},
        isAuthenticated: true,
        lastUsed: Date.now(),
      });

      const result = await sessionManager.refreshSession('example.com');

      expect(result).toBe(false);
    });
  });

  describe('Get All Session Health', () => {
    it('should return empty array when no sessions exist', () => {
      const allHealth = sessionManager.getAllSessionHealth();
      expect(allHealth).toEqual([]);
    });

    it('should return health for all sessions sorted by priority', async () => {
      const sessions = (sessionManager as any).sessions;

      // Add healthy session
      sessions.set('healthy.com:default', {
        domain: 'healthy.com',
        cookies: [{ name: 'session_id', expires: Math.floor(Date.now() / 1000) + 86400 * 7 }],
        localStorage: {},
        sessionStorage: {},
        isAuthenticated: true,
        lastUsed: Date.now(),
      });

      // Add expired session
      sessions.set('expired.com:default', {
        domain: 'expired.com',
        cookies: [{ name: 'auth_token', expires: Math.floor(Date.now() / 1000) - 3600 }],
        localStorage: {},
        sessionStorage: {},
        isAuthenticated: true,
        lastUsed: Date.now(),
      });

      // Add expiring soon session
      sessions.set('expiring.com:default', {
        domain: 'expiring.com',
        cookies: [{ name: 'session_id', expires: Math.floor(Date.now() / 1000) + 3600 }],
        localStorage: {},
        sessionStorage: {},
        isAuthenticated: true,
        lastUsed: Date.now(),
      });

      const allHealth = sessionManager.getAllSessionHealth();

      expect(allHealth).toHaveLength(3);
      // Should be sorted: expired first, then expiring_soon, then healthy
      expect(allHealth[0].status).toBe('expired');
      expect(allHealth[1].status).toBe('expiring_soon');
      expect(allHealth[2].status).toBe('healthy');
    });
  });

  describe('Load Session With Refresh', () => {
    let mockContext: BrowserContext;

    beforeEach(() => {
      mockContext = {
        addCookies: vi.fn().mockResolvedValue(undefined),
        cookies: vi.fn().mockResolvedValue([]),
      } as unknown as BrowserContext;
    });

    it('should return loaded:false, refreshed:false for non-existent session', async () => {
      const result = await sessionManager.loadSessionWithRefresh('nonexistent.com', mockContext);

      expect(result.loaded).toBe(false);
      expect(result.refreshed).toBe(false);
    });

    it('should load healthy session without refresh', async () => {
      const sessions = (sessionManager as any).sessions;
      sessions.set('example.com:default', {
        domain: 'example.com',
        cookies: [{ name: 'session_id', expires: Math.floor(Date.now() / 1000) + 86400 * 7 }],
        localStorage: {},
        sessionStorage: {},
        isAuthenticated: true,
        lastUsed: Date.now(),
      });

      const result = await sessionManager.loadSessionWithRefresh('example.com', mockContext);

      expect(result.loaded).toBe(true);
      expect(result.refreshed).toBe(false);
      expect(mockContext.addCookies).toHaveBeenCalled();
    });

    it('should attempt refresh for expired session', async () => {
      const mockRefreshCallback = vi.fn().mockResolvedValue(true);
      sessionManager.setRefreshCallback(mockRefreshCallback);

      const sessions = (sessionManager as any).sessions;
      sessions.set('example.com:default', {
        domain: 'example.com',
        cookies: [{ name: 'auth_token', expires: Math.floor(Date.now() / 1000) - 3600 }],
        localStorage: {},
        sessionStorage: {},
        isAuthenticated: true,
        lastUsed: Date.now(),
      });

      const result = await sessionManager.loadSessionWithRefresh('example.com', mockContext);

      expect(mockRefreshCallback).toHaveBeenCalledWith('example.com', 'default');
      expect(result.refreshed).toBe(true);
    });

    it('should still try loading expiring_soon session if refresh fails', async () => {
      const mockRefreshCallback = vi.fn().mockResolvedValue(false);
      sessionManager.setRefreshCallback(mockRefreshCallback);

      const sessions = (sessionManager as any).sessions;
      sessions.set('example.com:default', {
        domain: 'example.com',
        cookies: [{ name: 'session_id', expires: Math.floor(Date.now() / 1000) + 3600 }],
        localStorage: {},
        sessionStorage: {},
        isAuthenticated: true,
        lastUsed: Date.now(),
      });

      const result = await sessionManager.loadSessionWithRefresh('example.com', mockContext);

      expect(mockRefreshCallback).toHaveBeenCalled();
      expect(result.loaded).toBe(true);
      expect(result.refreshed).toBe(false);
      expect(mockContext.addCookies).toHaveBeenCalled();
    });
  });

  describe('Auth Cookie Detection', () => {
    it('should identify common auth cookie patterns', async () => {
      const sessions = (sessionManager as any).sessions;

      // Test various auth cookie patterns
      const authPatterns = [
        'session_id',
        'auth_token',
        'jwt_token',
        'user_session',
        'login_cookie',
        'JSESSIONID',
        'sid',
      ];

      for (const cookieName of authPatterns) {
        sessions.clear();
        sessions.set('test.com:default', {
          domain: 'test.com',
          cookies: [{ name: cookieName, expires: Math.floor(Date.now() / 1000) - 3600 }],
          localStorage: {},
          sessionStorage: {},
          isAuthenticated: true,
          lastUsed: Date.now(),
        });

        const health = sessionManager.getSessionHealth('test.com');
        expect(health.status).toBe('expired');
        expect(health.expiredCookies).toBeGreaterThan(0);
      }
    });

    it('should not count non-auth cookies as affecting session health', async () => {
      const sessions = (sessionManager as any).sessions;
      sessions.set('example.com:default', {
        domain: 'example.com',
        cookies: [
          { name: 'tracking_id', expires: Math.floor(Date.now() / 1000) - 3600 }, // expired non-auth
          { name: 'preferences', expires: Math.floor(Date.now() / 1000) - 7200 }, // expired non-auth
          { name: 'analytics', expires: Math.floor(Date.now() / 1000) - 3600 }, // expired non-auth
        ],
        localStorage: {},
        sessionStorage: {},
        isAuthenticated: false,
        lastUsed: Date.now(),
      });

      const health = sessionManager.getSessionHealth('example.com');

      // These are not auth cookies, so the session should still be considered healthy
      // (even though cookies are expired, they're not auth-related)
      expect(health.status).toBe('healthy');
    });
  });

  describe('Encryption Support', () => {
    const originalEnv = process.env;
    const testPassword = 'test-secure-password-123';

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should report encryption disabled when no key is set', () => {
      delete process.env.LLM_BROWSER_SESSION_KEY;
      const manager = new SessionManager(testSessionsDir);

      expect(manager.isEncryptionEnabled()).toBe(false);
    });

    it('should report encryption enabled when key is set', () => {
      process.env.LLM_BROWSER_SESSION_KEY = testPassword;
      const manager = new SessionManager(testSessionsDir);

      expect(manager.isEncryptionEnabled()).toBe(true);
    });

    it('should return correct env var name', () => {
      const manager = new SessionManager(testSessionsDir);

      expect(manager.getEncryptionEnvVar()).toBe('LLM_BROWSER_SESSION_KEY');
    });

    it('should encrypt session data when persisting with encryption enabled', async () => {
      process.env.LLM_BROWSER_SESSION_KEY = testPassword;

      // We need to capture what was written to disk
      let writtenContent = '';
      vi.mocked(fs.writeFile).mockImplementation(async (path, content) => {
        writtenContent = content as string;
      });

      const manager = new SessionManager(testSessionsDir);
      await manager.initialize();

      // Create a mock session and save it
      const mockContext = {
        cookies: vi.fn().mockResolvedValue([
          { name: 'session_id', value: 'test123', domain: 'example.com', path: '/' },
        ]),
        pages: vi.fn().mockReturnValue([]),
      } as unknown as BrowserContext;

      await manager.saveSession('example.com', mockContext, 'default');

      // Verify the written content is encrypted
      const crypto = new SessionCrypto();
      expect(crypto.isEncrypted(writtenContent)).toBe(true);
    });

    it('should decrypt session data when loading encrypted sessions', async () => {
      process.env.LLM_BROWSER_SESSION_KEY = testPassword;

      // Prepare encrypted session data
      const sessionData = {
        domain: 'example.com',
        cookies: [{ name: 'session_id', value: 'test123', domain: 'example.com', path: '/' }],
        localStorage: { key: 'value' },
        sessionStorage: {},
        isAuthenticated: true,
        lastUsed: Date.now(),
      };

      const crypto = new SessionCrypto();
      const encryptedData = crypto.encrypt(JSON.stringify(sessionData));

      // Mock fs to return encrypted data
      vi.mocked(fs.readdir).mockResolvedValue(['example.com_default.json'] as any);
      vi.mocked(fs.readFile).mockResolvedValue(encryptedData);

      const manager = new SessionManager(testSessionsDir);
      await manager.initialize();

      // Verify the session was loaded correctly
      const sessions = manager.listSessions();
      expect(sessions).toHaveLength(1);
      expect(sessions[0].domain).toBe('example.com');

      const health = manager.getSessionHealth('example.com');
      expect(health.isAuthenticated).toBe(true);
    });

    it('should migrate unencrypted sessions when encryption is enabled', async () => {
      process.env.LLM_BROWSER_SESSION_KEY = testPassword;

      // Prepare unencrypted session data
      const sessionData = {
        domain: 'example.com',
        cookies: [],
        localStorage: {},
        sessionStorage: {},
        isAuthenticated: false,
        lastUsed: Date.now(),
      };

      const plaintextData = JSON.stringify(sessionData);

      // Track what gets written
      let migratedContent = '';
      vi.mocked(fs.readdir).mockResolvedValue(['example.com_default.json'] as any);
      vi.mocked(fs.readFile).mockResolvedValue(plaintextData);
      vi.mocked(fs.writeFile).mockImplementation(async (path, content) => {
        migratedContent = content as string;
      });

      const manager = new SessionManager(testSessionsDir);
      await manager.initialize();

      // Verify the session was migrated to encrypted format
      const crypto = new SessionCrypto();
      expect(crypto.isEncrypted(migratedContent)).toBe(true);

      // Verify we can decrypt it back
      const decrypted = JSON.parse(crypto.decrypt(migratedContent));
      expect(decrypted.domain).toBe('example.com');
    });

    it('should handle loading when encryption key is missing for encrypted data', async () => {
      // First, encrypt some data with a key
      process.env.LLM_BROWSER_SESSION_KEY = testPassword;
      const crypto = new SessionCrypto();
      const sessionData = {
        domain: 'example.com',
        cookies: [],
        localStorage: {},
        sessionStorage: {},
        isAuthenticated: false,
        lastUsed: Date.now(),
      };
      const encryptedData = crypto.encrypt(JSON.stringify(sessionData));

      // Now try to load without the key
      delete process.env.LLM_BROWSER_SESSION_KEY;

      vi.mocked(fs.readdir).mockResolvedValue(['example.com_default.json'] as any);
      vi.mocked(fs.readFile).mockResolvedValue(encryptedData);

      const manager = new SessionManager(testSessionsDir);

      // Should not throw during initialization, but should log warning and skip the session
      await manager.initialize();

      // Session should not be loaded
      const sessions = manager.listSessions();
      expect(sessions).toHaveLength(0);
    });

    it('should skip temp files when loading sessions', async () => {
      process.env.LLM_BROWSER_SESSION_KEY = testPassword;

      vi.mocked(fs.readdir).mockResolvedValue([
        'example.com_default.json',
        '.tmp.12345.json',
        '.tmp.67890.99999.abc123.json',
      ] as any);

      // Only example.com should be read
      vi.mocked(fs.readFile).mockResolvedValue(
        JSON.stringify({
          domain: 'example.com',
          cookies: [],
          localStorage: {},
          sessionStorage: {},
          isAuthenticated: false,
          lastUsed: Date.now(),
        })
      );

      const manager = new SessionManager(testSessionsDir);
      await manager.initialize();

      // readFile should only be called once (for the real session file)
      expect(fs.readFile).toHaveBeenCalledTimes(1);
    });
  });
});
