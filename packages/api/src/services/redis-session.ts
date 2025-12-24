/**
 * Redis Session Cache Service
 *
 * Provides distributed session storage using Redis.
 * Enables session sharing across multiple API instances.
 *
 * Key patterns:
 * - session:{tenantId}:{domain}:{profile} - Session data (JSON)
 * - session_index:{tenantId} - Set of session keys for listing
 *
 * Sessions expire based on their expiresAt field or default TTL.
 */

import { getRedisClient, isRedisAvailable, buildKey } from './redis-client.js';

/** Session store interface (matching session-manager.ts) */
export interface SessionStore {
  domain: string;
  cookies: unknown[];
  localStorage: Record<string, string>;
  sessionStorage: Record<string, string>;
  isAuthenticated: boolean;
  authType?: string;
  lastUsed: number;
  expiresAt?: number;
  username?: string;
}

/** Session with metadata for cache storage */
interface CachedSession extends SessionStore {
  cachedAt: number;
  tenantId: string;
  profile: string;
}

// Default session TTL: 7 days in seconds
const DEFAULT_SESSION_TTL = 7 * 24 * 60 * 60;

// Cache for checking if Redis is ready
let redisReady: boolean | null = null;

async function shouldUseRedis(): Promise<boolean> {
  if (redisReady !== null) return redisReady;
  redisReady = await isRedisAvailable();
  return redisReady;
}

export function resetRedisCheck(): void {
  redisReady = null;
}

function sessionKey(tenantId: string, domain: string, profile: string): string {
  return buildKey('session', tenantId, domain, profile);
}

function indexKey(tenantId: string): string {
  return buildKey('session_index', tenantId);
}

function calculateTTL(session: SessionStore): number {
  if (session.expiresAt) {
    const ttl = Math.floor((session.expiresAt - Date.now()) / 1000);
    return Math.max(ttl, 60);
  }
  return DEFAULT_SESSION_TTL;
}

export async function saveSession(
  tenantId: string,
  domain: string,
  profile: string,
  session: SessionStore
): Promise<boolean> {
  const useRedis = await shouldUseRedis();
  if (!useRedis) return false;

  const redis = await getRedisClient();
  if (!redis) return false;

  const key = sessionKey(tenantId, domain, profile);
  const ttl = calculateTTL(session);

  const cachedSession: CachedSession = {
    ...session,
    cachedAt: Date.now(),
    tenantId,
    profile,
  };

  try {
    const pipeline = redis.pipeline();
    pipeline.setex(key, ttl, JSON.stringify(cachedSession));
    pipeline.sadd(indexKey(tenantId), key);
    await pipeline.exec();
    return true;
  } catch (error) {
    console.error('[Redis Session] Save error:', error);
    return false;
  }
}

export async function loadSession(
  tenantId: string,
  domain: string,
  profile: string
): Promise<SessionStore | null> {
  const useRedis = await shouldUseRedis();
  if (!useRedis) return null;

  const redis = await getRedisClient();
  if (!redis) return null;

  const key = sessionKey(tenantId, domain, profile);

  try {
    const data = await redis.get(key);
    if (!data) return null;

    const cached: CachedSession = JSON.parse(data);
    cached.lastUsed = Date.now();

    // Persist the updated lastUsed back to Redis, keeping the existing TTL
    await redis.set(key, JSON.stringify(cached), 'KEEPTTL');

    const { cachedAt: _c, tenantId: _t, profile: _p, ...session } = cached;
    return session;
  } catch (error) {
    console.error('[Redis Session] Load error:', error);
    return null;
  }
}

export async function hasSession(
  tenantId: string,
  domain: string,
  profile: string
): Promise<boolean> {
  const useRedis = await shouldUseRedis();
  if (!useRedis) return false;

  const redis = await getRedisClient();
  if (!redis) return false;

  try {
    return (await redis.exists(sessionKey(tenantId, domain, profile))) === 1;
  } catch (error) {
    console.error('[Redis Session] Has error:', error);
    return false;
  }
}

export async function deleteSession(
  tenantId: string,
  domain: string,
  profile: string
): Promise<boolean> {
  const useRedis = await shouldUseRedis();
  if (!useRedis) return false;

  const redis = await getRedisClient();
  if (!redis) return false;

  const key = sessionKey(tenantId, domain, profile);

  try {
    const pipeline = redis.pipeline();
    pipeline.del(key);
    pipeline.srem(indexKey(tenantId), key);
    await pipeline.exec();
    return true;
  } catch (error) {
    console.error('[Redis Session] Delete error:', error);
    return false;
  }
}

export async function listSessions(tenantId: string): Promise<string[]> {
  const useRedis = await shouldUseRedis();
  if (!useRedis) return [];

  const redis = await getRedisClient();
  if (!redis) return [];

  try {
    return await redis.smembers(indexKey(tenantId));
  } catch (error) {
    console.error('[Redis Session] List error:', error);
    return [];
  }
}

export async function getAllSessions(tenantId: string): Promise<SessionStore[]> {
  const useRedis = await shouldUseRedis();
  if (!useRedis) return [];

  const redis = await getRedisClient();
  if (!redis) return [];

  const keys = await listSessions(tenantId);
  if (keys.length === 0) return [];

  try {
    const pipeline = redis.pipeline();
    for (const key of keys) {
      pipeline.get(key);
    }
    const results = await pipeline.exec();

    const sessions: SessionStore[] = [];
    for (const result of results || []) {
      if (result && !result[0] && result[1]) {
        try {
          const cached: CachedSession = JSON.parse(result[1] as string);
          const { cachedAt: _c, tenantId: _t, profile: _p, ...session } = cached;
          sessions.push(session);
        } catch {
          // Skip invalid JSON
        }
      }
    }
    return sessions;
  } catch (error) {
    console.error('[Redis Session] GetAll error:', error);
    return [];
  }
}

export async function getSessionHealth(tenantId: string): Promise<{
  total: number;
  authenticated: number;
  expiringSoon: number;
  domains: string[];
}> {
  const sessions = await getAllSessions(tenantId);
  const now = Date.now();
  const warningThreshold = 24 * 60 * 60 * 1000;

  const domains = new Set<string>();
  let authenticated = 0;
  let expiringSoon = 0;

  for (const session of sessions) {
    domains.add(session.domain);
    if (session.isAuthenticated) authenticated++;
    if (session.expiresAt && session.expiresAt - now < warningThreshold) {
      expiringSoon++;
    }
  }

  return {
    total: sessions.length,
    authenticated,
    expiringSoon,
    domains: Array.from(domains),
  };
}

export async function clearTenantSessions(tenantId: string): Promise<number> {
  const useRedis = await shouldUseRedis();
  if (!useRedis) return 0;

  const redis = await getRedisClient();
  if (!redis) return 0;

  try {
    const keys = await redis.smembers(indexKey(tenantId));
    if (keys.length === 0) return 0;

    const pipeline = redis.pipeline();
    for (const key of keys) {
      pipeline.del(key);
    }
    pipeline.del(indexKey(tenantId));
    await pipeline.exec();

    return keys.length;
  } catch (error) {
    console.error('[Redis Session] Clear tenant error:', error);
    return 0;
  }
}
