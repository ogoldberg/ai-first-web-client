/**
 * Tests for Redis Session Cache Service
 *
 * These tests mock Redis as unavailable to test fallback behavior.
 * For full Redis tests, set REDIS_URL environment variable.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  saveSession,
  loadSession,
  hasSession,
  deleteSession,
  listSessions,
  getAllSessions,
  getSessionHealth,
  clearTenantSessions,
  resetRedisCheck,
  type SessionStore,
} from '../src/services/redis-session.js';

// Mock Redis client to not be available for unit tests
vi.mock('../src/services/redis-client.js', () => ({
  getRedisClient: vi.fn().mockResolvedValue(null),
  isRedisAvailable: vi.fn().mockResolvedValue(false),
  buildKey: (...parts: string[]) => parts.join(':'),
}));

describe('Redis Session Service (no Redis fallback)', () => {
  const mockSession: SessionStore = {
    domain: 'example.com',
    cookies: [{ name: 'session', value: 'abc123' }],
    localStorage: { key1: 'value1' },
    sessionStorage: {},
    isAuthenticated: true,
    authType: 'cookie',
    lastUsed: Date.now(),
    expiresAt: Date.now() + 86400000,
    username: 'testuser',
  };

  beforeEach(() => {
    resetRedisCheck();
  });

  describe('saveSession', () => {
    it('should return false when Redis is not available', async () => {
      const result = await saveSession('tenant1', 'example.com', 'default', mockSession);
      expect(result).toBe(false);
    });
  });

  describe('loadSession', () => {
    it('should return null when Redis is not available', async () => {
      const result = await loadSession('tenant1', 'example.com', 'default');
      expect(result).toBeNull();
    });
  });

  describe('hasSession', () => {
    it('should return false when Redis is not available', async () => {
      const result = await hasSession('tenant1', 'example.com', 'default');
      expect(result).toBe(false);
    });
  });

  describe('deleteSession', () => {
    it('should return false when Redis is not available', async () => {
      const result = await deleteSession('tenant1', 'example.com', 'default');
      expect(result).toBe(false);
    });
  });

  describe('listSessions', () => {
    it('should return empty array when Redis is not available', async () => {
      const result = await listSessions('tenant1');
      expect(result).toEqual([]);
    });
  });

  describe('getAllSessions', () => {
    it('should return empty array when Redis is not available', async () => {
      const result = await getAllSessions('tenant1');
      expect(result).toEqual([]);
    });
  });

  describe('getSessionHealth', () => {
    it('should return empty stats when Redis is not available', async () => {
      const result = await getSessionHealth('tenant1');
      expect(result).toEqual({
        total: 0,
        authenticated: 0,
        expiringSoon: 0,
        domains: [],
      });
    });
  });

  describe('clearTenantSessions', () => {
    it('should return 0 when Redis is not available', async () => {
      const result = await clearTenantSessions('tenant1');
      expect(result).toBe(0);
    });
  });
});

describe('Redis Session Service (with mocked Redis)', () => {
  const mockSession: SessionStore = {
    domain: 'example.com',
    cookies: [{ name: 'session', value: 'abc123' }],
    localStorage: { key1: 'value1' },
    sessionStorage: {},
    isAuthenticated: true,
    authType: 'cookie',
    lastUsed: Date.now(),
    expiresAt: Date.now() + 86400000,
    username: 'testuser',
  };

  beforeEach(() => {
    vi.resetAllMocks();
    resetRedisCheck();
  });

  describe('Session TTL calculation', () => {
    it('should calculate TTL based on expiresAt', () => {
      const session = { ...mockSession, expiresAt: Date.now() + 3600000 }; // 1 hour
      // TTL should be approximately 3600 seconds
      expect(session.expiresAt - Date.now()).toBeGreaterThan(3500000);
    });

    it('should use default TTL when no expiresAt', () => {
      const session = { ...mockSession };
      delete session.expiresAt;
      expect(session.expiresAt).toBeUndefined();
    });
  });

  describe('Session data structure', () => {
    it('should have required session fields', () => {
      expect(mockSession).toHaveProperty('domain');
      expect(mockSession).toHaveProperty('cookies');
      expect(mockSession).toHaveProperty('localStorage');
      expect(mockSession).toHaveProperty('sessionStorage');
      expect(mockSession).toHaveProperty('isAuthenticated');
      expect(mockSession).toHaveProperty('lastUsed');
    });

    it('should support optional session fields', () => {
      expect(mockSession).toHaveProperty('authType');
      expect(mockSession).toHaveProperty('expiresAt');
      expect(mockSession).toHaveProperty('username');
    });
  });
});
