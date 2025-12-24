/**
 * Database Configuration - Unified Storage Backend Selection
 *
 * Automatically selects between:
 * - Local development: SQLite + LanceDB (file-based, zero config)
 * - Production/hosted: PostgreSQL + pgvector (persistent, scalable)
 *
 * Selection is based on DATABASE_URL environment variable.
 */

import { logger } from './logger.js';

const log = logger.create('DatabaseConfig');

// Dynamic import type for PrismaClient
export type PrismaClientType = import('@prisma/client').PrismaClient;

// Lazy-loaded PrismaClient constructor
let PrismaClientConstructor: (new (options?: unknown) => PrismaClientType) | null = null;

/**
 * Try to load Prisma client dynamically
 */
async function loadPrismaClient(): Promise<typeof PrismaClientConstructor> {
  if (PrismaClientConstructor !== null) {
    return PrismaClientConstructor;
  }

  try {
    const prismaModule = await import('@prisma/client');
    PrismaClientConstructor = prismaModule.PrismaClient as new (options?: unknown) => PrismaClientType;
    return PrismaClientConstructor;
  } catch {
    log.warn('Prisma client not available - Postgres backend will not work');
    return null;
  }
}

/**
 * Default configuration paths
 */
const DEFAULT_SQLITE_PATH = './data/unbrowser.db';
const DEFAULT_VECTOR_DB_PATH = './data/vectors';

/**
 * Database configuration for SQLite backend
 */
interface SqliteConfig {
  backend: 'sqlite';
  sqlitePath: string;
  vectorDbPath: string;
  pooling: false;
}

/**
 * Database configuration for Postgres backend
 */
interface PostgresConfig {
  backend: 'postgres';
  databaseUrl: string;
  pooling: true;
  poolSize: number;
}

export type DatabaseConfig = SqliteConfig | PostgresConfig;

/**
 * Global Prisma client (singleton)
 */
let globalPrismaClient: PrismaClientType | null = null;

/**
 * Detect which storage backend to use based on environment
 */
export function detectStorageBackend(): 'sqlite' | 'postgres' {
  // If DATABASE_URL is set, use Postgres
  if (process.env.DATABASE_URL) {
    const url = process.env.DATABASE_URL;
    // Verify it's a postgres URL
    if (url.startsWith('postgres://') || url.startsWith('postgresql://')) {
      return 'postgres';
    }
    log.warn('DATABASE_URL set but not a Postgres URL, falling back to SQLite');
  }
  return 'sqlite';
}

/**
 * Get database configuration based on environment
 */
export function getDatabaseConfig(): DatabaseConfig {
  const backend = detectStorageBackend();

  if (backend === 'postgres') {
    return {
      backend: 'postgres',
      databaseUrl: process.env.DATABASE_URL!,
      pooling: true,
      poolSize: parseInt(process.env.DATABASE_POOL_SIZE || '10', 10),
    };
  }

  return {
    backend: 'sqlite',
    sqlitePath: process.env.SQLITE_PATH || DEFAULT_SQLITE_PATH,
    vectorDbPath: process.env.VECTOR_DB_PATH || DEFAULT_VECTOR_DB_PATH,
    pooling: false,
  };
}

/**
 * Get or create the global Prisma client
 *
 * Only creates a client if using Postgres backend.
 * Returns null for SQLite backend or if Prisma is not available.
 */
export async function getPrismaClient(): Promise<PrismaClientType | null> {
  const config = getDatabaseConfig();

  if (config.backend !== 'postgres') {
    return null;
  }

  if (!globalPrismaClient) {
    const PrismaClient = await loadPrismaClient();
    if (!PrismaClient) {
      log.error('Cannot create Prisma client - @prisma/client not available');
      return null;
    }

    globalPrismaClient = new PrismaClient({
      datasources: {
        db: {
          url: config.databaseUrl,
        },
      },
      log: process.env.DEBUG_PRISMA
        ? ['query', 'info', 'warn', 'error']
        : ['error'],
    });

    log.info('Created Prisma client', {
      poolSize: config.poolSize,
    });
  }

  return globalPrismaClient;
}

/**
 * Initialize database connection
 *
 * For Postgres: Tests connection and runs migrations if needed
 * For SQLite: Returns immediately (initialization happens in EmbeddedStore)
 */
export async function initializeDatabase(): Promise<void> {
  const config = getDatabaseConfig();
  log.info('Initializing database', { backend: config.backend });

  if (config.backend === 'postgres') {
    const prisma = await getPrismaClient();
    if (!prisma) {
      throw new Error('Failed to create Prisma client');
    }

    try {
      // Test connection
      await prisma.$connect();
      log.info('Connected to PostgreSQL');

      // Check if pgvector extension is available
      const result = await prisma.$queryRaw<Array<{ installed: boolean }>>`
        SELECT EXISTS (
          SELECT 1 FROM pg_extension WHERE extname = 'vector'
        ) as installed
      `;

      if (!result[0]?.installed) {
        log.warn('pgvector extension not installed - vector search will be disabled');
        log.info('Run: CREATE EXTENSION IF NOT EXISTS vector;');
      } else {
        log.info('pgvector extension is available');
      }
    } catch (error) {
      log.error('Failed to connect to PostgreSQL', { error });
      throw error;
    }
  } else {
    // config is SqliteConfig when backend is 'sqlite'
    const sqliteConfig = config as SqliteConfig;
    log.info('Using SQLite backend', {
      sqlitePath: sqliteConfig.sqlitePath,
      vectorDbPath: sqliteConfig.vectorDbPath,
    });
  }
}

/**
 * Close database connections
 */
export async function closeDatabase(): Promise<void> {
  if (globalPrismaClient) {
    await globalPrismaClient.$disconnect();
    globalPrismaClient = null;
    log.info('Closed PostgreSQL connection');
  }
}

/**
 * Check if Postgres backend is available and configured
 */
export function isPostgresAvailable(): boolean {
  return detectStorageBackend() === 'postgres';
}

/**
 * Get connection info for logging (sanitized)
 */
export function getConnectionInfo(): Record<string, unknown> {
  const config = getDatabaseConfig();

  if (config.backend === 'postgres' && config.databaseUrl) {
    // Sanitize URL to remove password
    const url = new URL(config.databaseUrl);
    url.password = '***';
    return {
      backend: 'postgres',
      host: url.hostname,
      port: url.port || 5432,
      database: url.pathname.slice(1),
      user: url.username,
      poolSize: config.poolSize,
    };
  }

  // config is SqliteConfig when backend is 'sqlite'
  const sqliteConfig = config as SqliteConfig;
  return {
    backend: 'sqlite',
    sqlitePath: sqliteConfig.sqlitePath,
    vectorDbPath: sqliteConfig.vectorDbPath,
  };
}

/**
 * Environment variables documentation
 */
export const DATABASE_ENV_VARS = {
  DATABASE_URL: 'PostgreSQL connection URL (e.g., postgresql://user:pass@host:5432/db)',
  SQLITE_PATH: `Path to SQLite database file (default: ${DEFAULT_SQLITE_PATH})`,
  VECTOR_DB_PATH: `Path to LanceDB directory (default: ${DEFAULT_VECTOR_DB_PATH})`,
  DATABASE_POOL_SIZE: 'PostgreSQL connection pool size (default: 10)',
  DEBUG_PRISMA: 'Enable Prisma query logging (set to any value)',
};
