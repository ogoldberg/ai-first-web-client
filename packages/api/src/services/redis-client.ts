/**
 * Redis Client Service
 *
 * Provides lazy-loaded Redis connection with graceful fallback.
 * Uses ioredis for robust connection handling.
 *
 * Configuration via environment variables:
 * - REDIS_URL: Full Redis URL (redis://user:pass@host:port)
 * - REDIS_HOST: Redis host (default: localhost)
 * - REDIS_PORT: Redis port (default: 6379)
 * - REDIS_PASSWORD: Redis password (optional)
 * - REDIS_DB: Redis database number (default: 0)
 * - REDIS_KEY_PREFIX: Key prefix for all keys (default: unbrowser:)
 */

// Type for ioredis Redis class
type Redis = import('ioredis').default;
type RedisOptions = import('ioredis').RedisOptions;

/** Redis client configuration */
export interface RedisConfig {
  url?: string;
  host?: string;
  port?: number;
  password?: string;
  db?: number;
  keyPrefix?: string;
  /** Connection timeout in ms */
  connectTimeout?: number;
  /** Max retries before giving up */
  maxRetriesPerRequest?: number;
  /** Enable offline queue (buffer commands while disconnected) */
  enableOfflineQueue?: boolean;
}

/** Redis connection status */
export interface RedisStatus {
  connected: boolean;
  available: boolean;
  lastError?: string;
  reconnecting?: boolean;
}

// Singleton state
let redisClient: Redis | null = null;
let redisAvailable: boolean | null = null;
let lastError: string | undefined;

/**
 * Get Redis configuration from environment
 */
export function getRedisConfig(): RedisConfig {
  return {
    url: process.env.REDIS_URL,
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_DB || '0', 10),
    keyPrefix: process.env.REDIS_KEY_PREFIX || 'unbrowser:',
    connectTimeout: 5000,
    maxRetriesPerRequest: 3,
    enableOfflineQueue: false,
  };
}

/**
 * Check if Redis is configured (REDIS_URL or REDIS_HOST is set)
 */
export function isRedisConfigured(): boolean {
  return !!(process.env.REDIS_URL || process.env.REDIS_HOST);
}

/**
 * Create Redis client with dynamic import
 *
 * @returns Redis client or null if not available
 */
async function createRedisClient(config: RedisConfig): Promise<Redis | null> {
  try {
    // Dynamic import of ioredis
    const { default: Redis } = await import('ioredis');

    const options: RedisOptions = {
      lazyConnect: true,
      connectTimeout: config.connectTimeout,
      maxRetriesPerRequest: config.maxRetriesPerRequest,
      enableOfflineQueue: config.enableOfflineQueue,
      keyPrefix: config.keyPrefix,
    };

    let client: Redis;

    if (config.url) {
      client = new Redis(config.url, options);
    } else {
      client = new Redis({
        ...options,
        host: config.host,
        port: config.port,
        password: config.password,
        db: config.db,
      });
    }

    // Set up event handlers
    client.on('error', (err: Error) => {
      lastError = err.message;
      console.error('[Redis] Connection error:', err.message);
    });

    client.on('connect', () => {
      console.log('[Redis] Connected');
      lastError = undefined;
    });

    client.on('reconnecting', () => {
      console.log('[Redis] Reconnecting...');
    });

    client.on('close', () => {
      console.log('[Redis] Connection closed');
    });

    return client;
  } catch {
    // ioredis not installed
    return null;
  }
}

/**
 * Get or create the global Redis client
 *
 * @returns Redis client or null if not available/configured
 */
export async function getRedisClient(): Promise<Redis | null> {
  // Return cached client
  if (redisClient !== null) {
    return redisClient;
  }

  // Already checked and not available
  if (redisAvailable === false) {
    return null;
  }

  // Not configured
  if (!isRedisConfigured()) {
    redisAvailable = false;
    console.log('[Redis] Not configured - using in-memory stores');
    return null;
  }

  // Try to create client
  const config = getRedisConfig();
  const client = await createRedisClient(config);

  if (!client) {
    redisAvailable = false;
    console.log('[Redis] ioredis not installed - using in-memory stores');
    return null;
  }

  // Test connection
  try {
    await client.connect();
    await client.ping();
    redisClient = client;
    redisAvailable = true;
    console.log('[Redis] Connection successful');
    return client;
  } catch (err) {
    lastError = err instanceof Error ? err.message : 'Unknown error';
    redisAvailable = false;
    console.error('[Redis] Connection failed:', lastError);
    await client.quit().catch(() => {});
    return null;
  }
}

/**
 * Get Redis connection status
 */
export function getRedisStatus(): RedisStatus {
  return {
    connected: redisClient?.status === 'ready',
    available: redisAvailable ?? false,
    lastError,
    reconnecting: redisClient?.status === 'reconnecting',
  };
}

/**
 * Close Redis connection
 */
export async function closeRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
    redisAvailable = null;
    console.log('[Redis] Connection closed');
  }
}

/**
 * Check if Redis is available and connected
 */
export async function isRedisAvailable(): Promise<boolean> {
  const client = await getRedisClient();
  return client !== null && client.status === 'ready';
}

/**
 * Helper to build prefixed keys
 */
export function buildKey(...parts: string[]): string {
  return parts.join(':');
}
