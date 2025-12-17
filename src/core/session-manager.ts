/**
 * Session Manager - Handles session persistence (cookies, localStorage, etc.)
 */

import { BrowserContext } from 'playwright';
import { promises as fs } from 'fs';
import path from 'path';
import type { SessionStore } from '../types/index.js';
import { logger } from '../utils/logger.js';

export class SessionManager {
  private sessionsDir: string;
  private sessions: Map<string, SessionStore> = new Map();

  constructor(sessionsDir: string = './sessions') {
    this.sessionsDir = sessionsDir;
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
   * Persist session to disk
   */
  private async persistSession(sessionKey: string, session: SessionStore): Promise<void> {
    const fileName = `${sessionKey.replace(/[:/]/g, '_')}.json`;
    const filePath = path.join(this.sessionsDir, fileName);

    await fs.writeFile(
      filePath,
      JSON.stringify(session, null, 2),
      'utf-8'
    );
  }

  /**
   * Load all sessions from disk
   */
  private async loadSessions(): Promise<void> {
    try {
      const files = await fs.readdir(this.sessionsDir);

      for (const file of files) {
        if (file.endsWith('.json')) {
          const filePath = path.join(this.sessionsDir, file);
          const content = await fs.readFile(filePath, 'utf-8');
          const session: SessionStore = JSON.parse(content);

          const sessionKey = file.replace('.json', '').replace(/_/g, ':');
          this.sessions.set(sessionKey, session);
        }
      }

      logger.session.info('Loaded saved sessions', { count: this.sessions.size });
    } catch (error) {
      // No sessions directory yet
    }
  }
}
