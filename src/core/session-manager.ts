/**
 * Session Manager - Handles session persistence (cookies, localStorage, etc.)
 *
 * Features:
 * - Atomic writes (temp file + rename) for session files to prevent corruption
 * - Optional encryption at rest using AES-256-GCM (set LLM_BROWSER_SESSION_KEY env var)
 * - Automatic migration from unencrypted to encrypted sessions
 */

import { BrowserContext } from 'playwright';
import { promises as fs } from 'fs';
import path from 'path';
import type { SessionStore } from '../types/index.js';
import { logger } from '../utils/logger.js';
import { SessionCrypto } from '../utils/session-crypto.js';

/**
 * Session health status
 */
export interface SessionHealth {
  status: 'healthy' | 'expiring_soon' | 'expired' | 'stale' | 'not_found';
  domain: string;
  profile: string;
  isAuthenticated: boolean;
  expiredCookies: number;
  totalCookies: number;
  lastUsed: number;
  staleDays: number;
  expiresInMs?: number;
  message: string;
}

/**
 * Refresh callback function type
 * Return true if refresh succeeded, false otherwise
 */
export type SessionRefreshCallback = (domain: string, profile: string) => Promise<boolean>;

/**
 * Session expiration thresholds
 */
const SESSION_THRESHOLDS = {
  /** Warn when session expires within this time (24 hours) */
  EXPIRING_SOON_MS: 24 * 60 * 60 * 1000,
  /** Consider session stale after this many days of non-use */
  STALE_DAYS: 30,
};

export class SessionManager {
  private sessionsDir: string;
  private sessions: Map<string, SessionStore> = new Map();
  private refreshCallback?: SessionRefreshCallback;
  private crypto: SessionCrypto;

  constructor(sessionsDir: string = './sessions') {
    this.sessionsDir = sessionsDir;
    // Create a new SessionCrypto instance to pick up current env config
    this.crypto = new SessionCrypto();
  }

  /**
   * Register a callback for auto-refreshing expired sessions
   * The callback should perform re-authentication and save the new session
   */
  setRefreshCallback(callback: SessionRefreshCallback): void {
    this.refreshCallback = callback;
  }

  async initialize(): Promise<void> {
    // Create sessions directory if it doesn't exist
    try {
      await fs.mkdir(this.sessionsDir, { recursive: true });
    } catch (error) {
      // Directory might already exist
    }

    // Load existing sessions
    await this.loadSessions();
  }

  /**
   * Save a browser session
   */
  async saveSession(
    domain: string,
    context: BrowserContext,
    profile: string = 'default'
  ): Promise<void> {
    const cookies = await context.cookies();
    const pages = context.pages();

    let localStorage: Record<string, string> = {};
    let sessionStorage: Record<string, string> = {};

    if (pages.length > 0) {
      const page = pages[0];

      // Extract localStorage
      try {
        localStorage = await page.evaluate(() => {
          const items: Record<string, string> = {};
          // @ts-ignore - window is available in browser context
          for (let i = 0; i < window.localStorage.length; i++) {
            // @ts-ignore
            const key = window.localStorage.key(i);
            if (key) {
              // @ts-ignore
              items[key] = window.localStorage.getItem(key) || '';
            }
          }
          return items;
        });
      } catch (e) {
        // Failed to extract localStorage
      }

      // Extract sessionStorage
      try {
        sessionStorage = await page.evaluate(() => {
          const items: Record<string, string> = {};
          // @ts-ignore - window is available in browser context
          for (let i = 0; i < window.sessionStorage.length; i++) {
            // @ts-ignore
            const key = window.sessionStorage.key(i);
            if (key) {
              // @ts-ignore
              items[key] = window.sessionStorage.getItem(key) || '';
            }
          }
          return items;
        });
      } catch (e) {
        // Failed to extract sessionStorage
      }
    }

    const sessionStore: SessionStore = {
      domain,
      cookies,
      localStorage,
      sessionStorage,
      isAuthenticated: await this.checkAuthentication(context),
      lastUsed: Date.now(),
    };

    const sessionKey = `${domain}:${profile}`;
    this.sessions.set(sessionKey, sessionStore);

    // Persist to disk
    await this.persistSession(sessionKey, sessionStore);

    logger.session.debug('Session saved', { domain, profile });
  }

  /**
   * Load a saved session into a browser context
   */
  async loadSession(
    domain: string,
    context: BrowserContext,
    profile: string = 'default'
  ): Promise<boolean> {
    const sessionKey = `${domain}:${profile}`;
    const session = this.sessions.get(sessionKey);

    if (!session) {
      return false;
    }

    // Restore cookies
    if (session.cookies.length > 0) {
      await context.addCookies(session.cookies);
    }

    // Update last used
    session.lastUsed = Date.now();
    await this.persistSession(sessionKey, session);

    logger.session.debug('Session loaded', { domain, profile });
    return true;
  }

  /**
   * Restore localStorage and sessionStorage to a page
   */
  async restoreStorage(domain: string, page: any, profile: string = 'default'): Promise<void> {
    const sessionKey = `${domain}:${profile}`;
    const session = this.sessions.get(sessionKey);

    if (!session) {
      return;
    }

    // Restore localStorage
    if (Object.keys(session.localStorage).length > 0) {
      await page.evaluate((storage: Record<string, string>) => {
        Object.entries(storage).forEach(([key, value]) => {
          // @ts-ignore - window is available in browser context
          window.localStorage.setItem(key, value);
        });
      }, session.localStorage);
    }

    // Restore sessionStorage
    if (Object.keys(session.sessionStorage).length > 0) {
      await page.evaluate((storage: Record<string, string>) => {
        Object.entries(storage).forEach(([key, value]) => {
          // @ts-ignore - window is available in browser context
          window.sessionStorage.setItem(key, value);
        });
      }, session.sessionStorage);
    }
  }

  /**
   * Check if a session exists and is valid
   */
  hasSession(domain: string, profile: string = 'default'): boolean {
    const sessionKey = `${domain}:${profile}`;
    return this.sessions.has(sessionKey);
  }

  /**
   * Get raw session data (GAP-009: for session sharing)
   */
  getSession(domain: string, profile: string = 'default'): SessionStore | undefined {
    const sessionKey = `${domain}:${profile}`;
    return this.sessions.get(sessionKey);
  }

  /**
   * Save session data directly without a browser context (GAP-009: for shared sessions)
   */
  async saveSessionData(session: SessionStore, profile: string = 'default'): Promise<void> {
    const sessionKey = `${session.domain}:${profile}`;
    this.sessions.set(sessionKey, session);
    await this.persistSession(sessionKey, session);
    logger.session.info('Saved shared session', {
      domain: session.domain,
      profile,
    });
  }

  /**
   * List all saved sessions
   */
  listSessions(): Array<{ domain: string; profile: string; lastUsed: number }> {
    const sessions: Array<{ domain: string; profile: string; lastUsed: number }> = [];

    for (const [key, session] of this.sessions) {
      const [domain, profile] = key.split(':');
      sessions.push({
        domain,
        profile,
        lastUsed: session.lastUsed,
      });
    }

    return sessions.sort((a, b) => b.lastUsed - a.lastUsed);
  }

  /**
   * Delete a session
   */
  async deleteSession(domain: string, profile: string = 'default'): Promise<void> {
    const sessionKey = `${domain}:${profile}`;
    this.sessions.delete(sessionKey);

    const filePath = path.join(this.sessionsDir, `${sessionKey.replace(/[:/]/g, '_')}.json`);
    try {
      await fs.unlink(filePath);
    } catch (e) {
      // File might not exist
    }
  }

  /**
   * Check session health - detects expired, expiring soon, and stale sessions
   */
  getSessionHealth(domain: string, profile: string = 'default'): SessionHealth {
    const sessionKey = `${domain}:${profile}`;
    const session = this.sessions.get(sessionKey);

    if (!session) {
      return {
        status: 'not_found',
        domain,
        profile,
        isAuthenticated: false,
        expiredCookies: 0,
        totalCookies: 0,
        lastUsed: 0,
        staleDays: 0,
        message: `No session found for ${domain} (profile: ${profile})`,
      };
    }

    const now = Date.now();
    const daysSinceUse = (now - session.lastUsed) / (1000 * 60 * 60 * 24);

    // Check for stale session (unused for too long)
    if (daysSinceUse > SESSION_THRESHOLDS.STALE_DAYS) {
      return {
        status: 'stale',
        domain,
        profile,
        isAuthenticated: session.isAuthenticated,
        expiredCookies: 0,
        totalCookies: session.cookies.length,
        lastUsed: session.lastUsed,
        staleDays: Math.floor(daysSinceUse),
        message: `Session unused for ${Math.floor(daysSinceUse)} days`,
      };
    }

    // Check cookie expiration (only for auth cookies)
    const { expiredAuthCookieCount, soonestExpiry } = this.analyzeSessionCookies(session.cookies);
    const totalCookies = session.cookies.length;
    const totalAuthCookies = this.countAuthCookies(session.cookies);

    // All auth cookies expired (only if there were auth cookies to begin with)
    if (totalAuthCookies > 0 && expiredAuthCookieCount >= totalAuthCookies) {
      return {
        status: 'expired',
        domain,
        profile,
        isAuthenticated: false,
        expiredCookies: expiredAuthCookieCount,
        totalCookies,
        lastUsed: session.lastUsed,
        staleDays: Math.floor(daysSinceUse),
        message: `${expiredAuthCookieCount} authentication cookie(s) expired`,
      };
    }

    // Session expiring soon (only if there are auth cookies)
    if (soonestExpiry !== null && soonestExpiry < SESSION_THRESHOLDS.EXPIRING_SOON_MS) {
      const hoursUntilExpiry = Math.ceil(soonestExpiry / (1000 * 60 * 60));
      return {
        status: 'expiring_soon',
        domain,
        profile,
        isAuthenticated: session.isAuthenticated,
        expiredCookies: expiredAuthCookieCount,
        totalCookies,
        lastUsed: session.lastUsed,
        staleDays: Math.floor(daysSinceUse),
        expiresInMs: soonestExpiry,
        message: `Session expires in ${hoursUntilExpiry} hour(s)`,
      };
    }

    return {
      status: 'healthy',
      domain,
      profile,
      isAuthenticated: session.isAuthenticated,
      expiredCookies: expiredAuthCookieCount,
      totalCookies,
      lastUsed: session.lastUsed,
      staleDays: Math.floor(daysSinceUse),
      expiresInMs: soonestExpiry ?? undefined,
      message: 'Session is healthy',
    };
  }

  /**
   * Check if a session is expired
   */
  isSessionExpired(domain: string, profile: string = 'default'): boolean {
    const health = this.getSessionHealth(domain, profile);
    return health.status === 'expired' || health.status === 'not_found';
  }

  /**
   * Attempt to refresh an expired session using the registered callback
   * Returns true if refresh succeeded
   */
  async refreshSession(domain: string, profile: string = 'default'): Promise<boolean> {
    if (!this.refreshCallback) {
      console.error(`[Session] No refresh callback registered for auto-refresh`);
      return false;
    }

    const health = this.getSessionHealth(domain, profile);

    if (health.status === 'healthy') {
      console.error(`[Session] Session for ${domain} is healthy, no refresh needed`);
      return true;
    }

    console.error(`[Session] Attempting to refresh ${health.status} session for ${domain}`);

    try {
      const success = await this.refreshCallback(domain, profile);

      if (success) {
        console.error(`[Session] Successfully refreshed session for ${domain}`);
      } else {
        console.error(`[Session] Failed to refresh session for ${domain}`);
      }

      return success;
    } catch (error) {
      console.error(`[Session] Error during refresh for ${domain}:`, error);
      return false;
    }
  }

  /**
   * Load session with optional auto-refresh for expired sessions
   */
  async loadSessionWithRefresh(
    domain: string,
    context: BrowserContext,
    profile: string = 'default'
  ): Promise<{ loaded: boolean; refreshed: boolean }> {
    const health = this.getSessionHealth(domain, profile);

    if (health.status === 'not_found') {
      return { loaded: false, refreshed: false };
    }

    // If session is expired or expiring soon, try to refresh
    if (health.status === 'expired' || health.status === 'expiring_soon') {
      const refreshed = await this.refreshSession(domain, profile);

      if (refreshed) {
        // Load the newly refreshed session
        const loaded = await this.loadSession(domain, context, profile);
        return { loaded, refreshed: true };
      }

      // If refresh failed but session exists, try loading anyway (might still work)
      if (health.status === 'expiring_soon') {
        const loaded = await this.loadSession(domain, context, profile);
        return { loaded, refreshed: false };
      }

      return { loaded: false, refreshed: false };
    }

    // Session is healthy or just stale - load it
    const loaded = await this.loadSession(domain, context, profile);
    return { loaded, refreshed: false };
  }

  /**
   * Get health status for all sessions
   */
  getAllSessionHealth(): SessionHealth[] {
    const healthStatuses: SessionHealth[] = [];

    for (const [key] of this.sessions) {
      const [domain, profile] = key.split(':');
      healthStatuses.push(this.getSessionHealth(domain, profile));
    }

    return healthStatuses.sort((a, b) => {
      // Sort by status priority: expired > expiring_soon > stale > healthy
      const statusPriority = { expired: 0, expiring_soon: 1, stale: 2, healthy: 3, not_found: 4 };
      return statusPriority[a.status] - statusPriority[b.status];
    });
  }

  /**
   * Analyze cookies for expiration
   * Only counts expired AUTH cookies for determining session expiration
   */
  private analyzeSessionCookies(cookies: any[]): {
    expiredAuthCookieCount: number;
    soonestExpiry: number | null;
  } {
    const now = Date.now();
    let expiredAuthCookieCount = 0;
    let soonestExpiry: number | null = null;

    for (const cookie of cookies) {
      // Skip session cookies (no expiry or -1)
      if (!cookie.expires || cookie.expires === -1) {
        continue;
      }

      // Playwright uses seconds, convert to ms
      const expiryMs = cookie.expires * 1000;
      const timeUntilExpiry = expiryMs - now;

      // Only track auth cookies for expiration status
      if (this.isAuthCookie(cookie)) {
        if (timeUntilExpiry <= 0) {
          expiredAuthCookieCount++;
        } else {
          // Track soonest expiry among auth cookies
          if (soonestExpiry === null || timeUntilExpiry < soonestExpiry) {
            soonestExpiry = timeUntilExpiry;
          }
        }
      }
    }

    return { expiredAuthCookieCount, soonestExpiry };
  }

  /**
   * Count authentication cookies
   */
  private countAuthCookies(cookies: any[]): number {
    return cookies.filter((cookie) => this.isAuthCookie(cookie)).length;
  }

  /**
   * Check if a cookie is likely an authentication cookie
   */
  private isAuthCookie(cookie: any): boolean {
    const authPatterns = [/session/i, /auth/i, /token/i, /user/i, /login/i, /jwt/i, /sid/i];
    return authPatterns.some((pattern) => pattern.test(cookie.name));
  }

  /**
   * Check if the session is authenticated (heuristic)
   */
  private async checkAuthentication(context: BrowserContext): Promise<boolean> {
    const cookies = await context.cookies();

    // Look for common auth cookie names
    const authCookiePatterns = [
      /session/i,
      /auth/i,
      /token/i,
      /user/i,
      /login/i,
    ];

    return cookies.some(cookie =>
      authCookiePatterns.some(pattern => pattern.test(cookie.name))
    );
  }

  /**
   * Check if session encryption is enabled
   */
  isEncryptionEnabled(): boolean {
    return this.crypto.isEnabled();
  }

  /**
   * Get the environment variable name for encryption key
   */
  getEncryptionEnvVar(): string {
    return this.crypto.getEnvVarName();
  }

  /**
   * Persist session to disk using atomic write (temp file + rename)
   * Encrypts session data if encryption key is configured
   */
  private async persistSession(sessionKey: string, session: SessionStore): Promise<void> {
    const fileName = `${sessionKey.replace(/[:/]/g, '_')}.json`;
    const filePath = path.join(this.sessionsDir, fileName);

    // Serialize session data
    const plaintext = JSON.stringify(session, null, 2);

    // Encrypt if enabled (returns plaintext if disabled)
    const content = this.crypto.encrypt(plaintext);

    // Atomic write: write to temp file in same directory, then rename
    const tempPath = path.join(
      this.sessionsDir,
      `.tmp.${Date.now()}.${process.pid}.${Math.random().toString(36).slice(2)}.json`
    );

    try {
      await fs.writeFile(tempPath, content, 'utf-8');
      await fs.rename(tempPath, filePath);
    } catch (error) {
      // Clean up temp file if rename failed
      try {
        await fs.unlink(tempPath);
      } catch {
        // Ignore cleanup errors
      }
      throw error;
    }
  }

  /**
   * Load all sessions from disk
   * Decrypts session data if encrypted
   * Migrates unencrypted sessions to encrypted if encryption is enabled
   */
  private async loadSessions(): Promise<void> {
    let migratedCount = 0;

    try {
      const files = await fs.readdir(this.sessionsDir);

      for (const file of files) {
        // Skip temp files
        if (!file.endsWith('.json') || file.startsWith('.tmp.')) {
          continue;
        }

        const filePath = path.join(this.sessionsDir, file);

        try {
          const content = await fs.readFile(filePath, 'utf-8');

          // Decrypt content (returns as-is if not encrypted)
          const decrypted = this.crypto.decrypt(content);
          const session: SessionStore = JSON.parse(decrypted);

          const sessionKey = file.replace('.json', '').replace(/_/g, ':');
          this.sessions.set(sessionKey, session);

          // Migrate unencrypted session to encrypted if encryption is now enabled
          if (this.crypto.isEnabled() && !this.crypto.isEncrypted(content)) {
            await this.persistSession(sessionKey, session);
            migratedCount++;
            logger.session.debug('Migrated session to encrypted format', {
              sessionKey,
            });
          }
        } catch (error) {
          // Log but continue loading other sessions
          logger.session.warn('Failed to load session file', {
            file,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      if (migratedCount > 0) {
        logger.session.info('Migrated sessions to encrypted format', {
          count: migratedCount,
        });
      }

      logger.session.info('Loaded saved sessions', {
        count: this.sessions.size,
        encrypted: this.crypto.isEnabled(),
      });
    } catch (error) {
      // No sessions directory yet
    }
  }
}
