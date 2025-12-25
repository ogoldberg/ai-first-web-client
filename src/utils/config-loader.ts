/**
 * Configuration File Loader (D-005)
 *
 * Loads configuration from .llmbrowserrc or .llmbrowserrc.json files.
 * Configuration precedence: Environment Variables > Config File > Defaults
 *
 * Search paths (in order):
 * 1. Current working directory
 * 2. Home directory (~/.llmbrowserrc)
 * 3. Package root (for npm package users)
 *
 * Supported file names:
 * - .llmbrowserrc (JSON format)
 * - .llmbrowserrc.json
 * - llmbrowserrc.json
 * - .unbrowserrc (alias)
 * - .unbrowserrc.json (alias)
 *
 * @example
 * // .llmbrowserrc in project root
 * {
 *   "log": {
 *     "level": "debug",
 *     "prettyPrint": true
 *   },
 *   "browserProvider": {
 *     "stealth": true,
 *     "timeout": 60000
 *   }
 * }
 */

import { existsSync, readFileSync } from 'fs';
import { homedir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { z } from 'zod';
import {
  logConfigSchema,
  databaseConfigSchema,
  browserProviderConfigSchema,
  redisConfigSchema,
  proxyConfigSchema,
  apiServerConfigSchema,
  stripeConfigSchema,
  mcpServerConfigSchema,
  sdkConfigSchema,
  type LogConfig,
  type DatabaseConfig,
  type BrowserProviderConfig,
  type RedisConfig,
  type ProxyConfig,
  type ApiServerConfig,
  type StripeConfig,
  type McpServerConfig,
  type SdkConfig,
} from './config-schemas.js';
import { logger } from './logger.js';

const log = logger.create('ConfigLoader');

// ============================================
// CONFIG FILE SCHEMA
// ============================================

/**
 * Schema for configuration file contents.
 * All fields are optional - missing fields use defaults or env vars.
 */
export const configFileSchema = z.object({
  // Logging configuration
  log: z.object({
    level: z.enum(['debug', 'info', 'warn', 'error', 'silent']).optional(),
    prettyPrint: z.boolean().optional(),
  }).optional(),

  // Database configuration
  database: z.object({
    databaseUrl: z.string().optional(),
    sqlitePath: z.string().optional(),
    vectorDbPath: z.string().optional(),
    poolSize: z.number().int().min(1).max(100).optional(),
    debugPrisma: z.boolean().optional(),
  }).optional(),

  // Browser provider configuration
  browserProvider: z.object({
    type: z.enum(['local', 'browserless', 'brightdata', 'custom']).optional(),
    browserlessToken: z.string().optional(),
    browserlessUrl: z.string().optional(),
    brightdataAuth: z.string().optional(),
    brightdataZone: z.enum(['residential', 'unblocker', 'datacenter', 'isp', 'scraping_browser']).optional(),
    brightdataCountry: z.string().length(2).optional(),
    customEndpoint: z.string().optional(),
    timeout: z.number().int().min(1000).max(300000).optional(),
    stealth: z.boolean().optional(),
  }).optional(),

  // Redis configuration
  redis: z.object({
    url: z.string().optional(),
    host: z.string().optional(),
    port: z.number().int().min(1).max(65535).optional(),
    password: z.string().optional(),
    db: z.number().int().min(0).max(15).optional(),
    keyPrefix: z.string().optional(),
    connectTimeout: z.number().int().min(100).max(60000).optional(),
    maxRetriesPerRequest: z.number().int().min(0).max(10).optional(),
    enableOfflineQueue: z.boolean().optional(),
  }).optional(),

  // Proxy configuration
  proxy: z.object({
    datacenterUrls: z.array(z.string()).optional(),
    ispUrls: z.array(z.string()).optional(),
    brightdataAuth: z.string().optional(),
    brightdataZone: z.enum(['residential', 'unblocker', 'datacenter', 'isp']).optional(),
    brightdataCountry: z.string().length(2).optional(),
    brightdataCountries: z.array(z.string().length(2)).optional(),
    brightdataSessionRotation: z.boolean().optional(),
    brightdataPort: z.number().int().min(1).max(65535).optional(),
    healthWindow: z.number().int().min(10).max(1000).optional(),
    cooldownMinutes: z.number().int().min(1).max(1440).optional(),
    blockThreshold: z.number().min(0).max(1).optional(),
    riskCacheMinutes: z.number().int().min(1).max(1440).optional(),
    enableRiskLearning: z.boolean().optional(),
  }).optional(),

  // API server configuration
  apiServer: z.object({
    nodeEnv: z.enum(['development', 'production', 'test']).optional(),
    port: z.number().int().min(1).max(65535).optional(),
    corsOrigins: z.array(z.string()).optional(),
  }).optional(),

  // Stripe configuration
  stripe: z.object({
    secretKey: z.string().optional(),
    webhookSecret: z.string().optional(),
    priceId: z.string().optional(),
    meterEventName: z.string().optional(),
  }).optional(),

  // MCP server configuration
  mcpServer: z.object({
    debugMode: z.boolean().optional(),
    adminMode: z.boolean().optional(),
    tenantId: z.string().optional(),
  }).optional(),

  // SDK configuration
  sdk: z.object({
    sessionsDir: z.string().optional(),
    learningEnginePath: z.string().optional(),
    disableProceduralMemory: z.boolean().optional(),
    disableLearning: z.boolean().optional(),
  }).optional(),
}).strict();

export type ConfigFile = z.infer<typeof configFileSchema>;

// ============================================
// FILE SEARCH
// ============================================

/**
 * Names of config files to search for (in priority order).
 */
const CONFIG_FILE_NAMES = [
  '.llmbrowserrc',
  '.llmbrowserrc.json',
  'llmbrowserrc.json',
  '.unbrowserrc',
  '.unbrowserrc.json',
];

/**
 * Get the package root directory.
 */
function getPackageRoot(): string {
  try {
    // Get the directory of this file
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    // Go up from src/utils to package root
    return join(__dirname, '..', '..');
  } catch {
    return process.cwd();
  }
}

/**
 * Get directories to search for config files.
 */
function getSearchPaths(): string[] {
  const paths: string[] = [];

  // 1. Current working directory (highest priority)
  paths.push(process.cwd());

  // 2. Home directory
  try {
    const home = homedir();
    if (home && !paths.includes(home)) {
      paths.push(home);
    }
  } catch {
    // Ignore if homedir fails
  }

  // 3. Package root (for npm package users)
  const packageRoot = getPackageRoot();
  if (!paths.includes(packageRoot)) {
    paths.push(packageRoot);
  }

  return paths;
}

/**
 * Find the first existing config file.
 */
function findConfigFile(): string | null {
  const searchPaths = getSearchPaths();

  for (const dir of searchPaths) {
    for (const fileName of CONFIG_FILE_NAMES) {
      const filePath = join(dir, fileName);
      if (existsSync(filePath)) {
        log.debug('Found config file', { path: filePath });
        return filePath;
      }
    }
  }

  log.debug('No config file found', { searchPaths, fileNames: CONFIG_FILE_NAMES });
  return null;
}

// ============================================
// FILE LOADING
// ============================================

/**
 * Load and parse a config file.
 */
function loadConfigFile(filePath: string): ConfigFile {
  try {
    const content = readFileSync(filePath, 'utf-8');

    // Strip comments for .llmbrowserrc files (not strictly JSON)
    // This allows // and /* */ comments in the config file
    const stripped = content
      .replace(/\/\*[\s\S]*?\*\//g, '') // Remove /* */ comments
      .replace(/\/\/.*$/gm, '');        // Remove // comments

    const parsed = JSON.parse(stripped);
    const result = configFileSchema.safeParse(parsed);

    if (!result.success) {
      log.warn('Config file validation failed', {
        path: filePath,
        errors: result.error.issues.map(i => ({
          path: i.path.join('.'),
          message: i.message,
        })),
      });
      // Return empty config on validation failure - use defaults
      return {};
    }

    log.info('Loaded config file', {
      path: filePath,
      sections: Object.keys(result.data).filter(k => result.data[k as keyof ConfigFile] !== undefined),
    });

    return result.data;
  } catch (error) {
    if (error instanceof SyntaxError) {
      log.warn('Config file has invalid JSON', {
        path: filePath,
        error: error.message,
      });
    } else {
      log.warn('Failed to read config file', {
        path: filePath,
        error: String(error),
      });
    }
    return {};
  }
}

// ============================================
// CACHED CONFIG
// ============================================

let cachedConfigFile: ConfigFile | null = null;
let cachedConfigFilePath: string | null = null;
let configFileLoaded = false;

/**
 * Get the loaded config file (cached after first load).
 */
export function getConfigFile(): ConfigFile {
  if (!configFileLoaded) {
    cachedConfigFilePath = findConfigFile();
    if (cachedConfigFilePath) {
      cachedConfigFile = loadConfigFile(cachedConfigFilePath);
    } else {
      cachedConfigFile = {};
    }
    configFileLoaded = true;
  }
  return cachedConfigFile ?? {};
}

/**
 * Clear the config file cache.
 * Useful for testing or reloading configuration.
 */
export function clearConfigFileCache(): void {
  cachedConfigFile = null;
  cachedConfigFilePath = null;
  configFileLoaded = false;
}

// ============================================
// MERGE HELPERS
// ============================================

/**
 * Convert a boolean to an environment variable string format.
 */
function boolToEnvString(value: boolean | undefined): string | undefined {
  if (value === undefined) return undefined;
  return value ? 'true' : 'false';
}

/**
 * Convert a number to an environment variable string format.
 */
function numToEnvString(value: number | undefined): string | undefined {
  if (value === undefined) return undefined;
  return String(value);
}

/**
 * Convert an array to a comma-separated string format.
 */
function arrayToEnvString(value: string[] | undefined): string | undefined {
  if (value === undefined || value.length === 0) return undefined;
  return value.join(',');
}

// ============================================
// MERGED CONFIG FUNCTIONS
// ============================================

/**
 * Get merged log configuration.
 * Config file values are used unless overridden by environment variables.
 */
export function getMergedLogConfig(): LogConfig {
  const file = getConfigFile().log ?? {};

  const merged = {
    level: process.env.LOG_LEVEL ?? file.level,
    prettyPrint: process.env.LOG_PRETTY ?? boolToEnvString(file.prettyPrint),
  };

  return logConfigSchema.parse(merged);
}

/**
 * Get merged database configuration.
 */
export function getMergedDatabaseConfig(): DatabaseConfig {
  const file = getConfigFile().database ?? {};

  const merged = {
    databaseUrl: process.env.DATABASE_URL ?? file.databaseUrl,
    sqlitePath: process.env.SQLITE_PATH ?? file.sqlitePath,
    vectorDbPath: process.env.VECTOR_DB_PATH ?? file.vectorDbPath,
    poolSize: process.env.DATABASE_POOL_SIZE ?? numToEnvString(file.poolSize),
    debugPrisma: process.env.DEBUG_PRISMA ?? boolToEnvString(file.debugPrisma),
  };

  return databaseConfigSchema.parse(merged);
}

/**
 * Get merged browser provider configuration.
 */
export function getMergedBrowserProviderConfig(): BrowserProviderConfig {
  const file = getConfigFile().browserProvider ?? {};

  const merged = {
    type: process.env.BROWSER_PROVIDER ?? file.type,
    browserlessToken: process.env.BROWSERLESS_TOKEN ?? file.browserlessToken,
    browserlessUrl: process.env.BROWSERLESS_URL ?? file.browserlessUrl,
    brightdataAuth: process.env.BRIGHTDATA_AUTH ?? file.brightdataAuth,
    brightdataZone: process.env.BRIGHTDATA_ZONE ?? file.brightdataZone,
    brightdataCountry: process.env.BRIGHTDATA_COUNTRY ?? file.brightdataCountry,
    customEndpoint: process.env.BROWSER_ENDPOINT ?? file.customEndpoint,
    timeout: process.env.BROWSER_TIMEOUT ?? numToEnvString(file.timeout),
    stealth: process.env.LLM_BROWSER_STEALTH ?? boolToEnvString(file.stealth),
  };

  return browserProviderConfigSchema.parse(merged);
}

/**
 * Get merged Redis configuration.
 */
export function getMergedRedisConfig(): RedisConfig {
  const file = getConfigFile().redis ?? {};

  const merged = {
    url: process.env.REDIS_URL ?? file.url,
    host: process.env.REDIS_HOST ?? file.host,
    port: process.env.REDIS_PORT ?? numToEnvString(file.port),
    password: process.env.REDIS_PASSWORD ?? file.password,
    db: process.env.REDIS_DB ?? numToEnvString(file.db),
    keyPrefix: process.env.REDIS_KEY_PREFIX ?? file.keyPrefix,
    connectTimeout: process.env.REDIS_CONNECT_TIMEOUT ?? numToEnvString(file.connectTimeout),
    maxRetriesPerRequest: process.env.REDIS_MAX_RETRIES ?? numToEnvString(file.maxRetriesPerRequest),
    enableOfflineQueue: process.env.REDIS_OFFLINE_QUEUE ?? boolToEnvString(file.enableOfflineQueue),
  };

  return redisConfigSchema.parse(merged);
}

/**
 * Get merged proxy configuration.
 */
export function getMergedProxyConfig(): ProxyConfig {
  const file = getConfigFile().proxy ?? {};

  const merged = {
    datacenterUrls: process.env.PROXY_DATACENTER_URLS ?? arrayToEnvString(file.datacenterUrls),
    ispUrls: process.env.PROXY_ISP_URLS ?? arrayToEnvString(file.ispUrls),
    brightdataAuth: process.env.BRIGHTDATA_AUTH ?? file.brightdataAuth,
    brightdataZone: process.env.BRIGHTDATA_ZONE ?? file.brightdataZone,
    brightdataCountry: process.env.BRIGHTDATA_COUNTRY ?? file.brightdataCountry,
    brightdataCountries: process.env.BRIGHTDATA_COUNTRIES ?? arrayToEnvString(file.brightdataCountries),
    brightdataSessionRotation: process.env.BRIGHTDATA_SESSION_ROTATION ?? boolToEnvString(file.brightdataSessionRotation),
    brightdataPort: process.env.BRIGHTDATA_PORT ?? numToEnvString(file.brightdataPort),
    healthWindow: process.env.PROXY_HEALTH_WINDOW ?? numToEnvString(file.healthWindow),
    cooldownMinutes: process.env.PROXY_COOLDOWN_MINUTES ?? numToEnvString(file.cooldownMinutes),
    blockThreshold: process.env.PROXY_BLOCK_THRESHOLD ?? numToEnvString(file.blockThreshold),
    riskCacheMinutes: process.env.DOMAIN_RISK_CACHE_MINUTES ?? numToEnvString(file.riskCacheMinutes),
    enableRiskLearning: process.env.DOMAIN_RISK_LEARNING ?? boolToEnvString(file.enableRiskLearning),
  };

  return proxyConfigSchema.parse(merged);
}

/**
 * Get merged API server configuration.
 */
export function getMergedApiServerConfig(): ApiServerConfig {
  const file = getConfigFile().apiServer ?? {};

  const merged = {
    nodeEnv: process.env.NODE_ENV ?? file.nodeEnv,
    port: process.env.PORT ?? numToEnvString(file.port),
    corsOrigins: process.env.CORS_ORIGINS ?? arrayToEnvString(file.corsOrigins),
  };

  return apiServerConfigSchema.parse(merged);
}

/**
 * Get merged Stripe configuration.
 */
export function getMergedStripeConfig(): StripeConfig {
  const file = getConfigFile().stripe ?? {};

  const merged = {
    secretKey: process.env.STRIPE_SECRET_KEY ?? file.secretKey,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? file.webhookSecret,
    priceId: process.env.STRIPE_PRICE_ID ?? file.priceId,
    meterEventName: process.env.STRIPE_METER_EVENT_NAME ?? file.meterEventName,
  };

  return stripeConfigSchema.parse(merged);
}

/**
 * Get merged MCP server configuration.
 */
export function getMergedMcpServerConfig(): McpServerConfig {
  const file = getConfigFile().mcpServer ?? {};

  const merged = {
    debugMode: process.env.LLM_BROWSER_DEBUG_MODE ?? boolToEnvString(file.debugMode),
    adminMode: process.env.LLM_BROWSER_ADMIN_MODE ?? boolToEnvString(file.adminMode),
    tenantId: process.env.LLM_BROWSER_TENANT_ID ?? file.tenantId,
  };

  return mcpServerConfigSchema.parse(merged);
}

/**
 * Get merged SDK configuration.
 */
export function getMergedSdkConfig(): SdkConfig {
  const file = getConfigFile().sdk ?? {};

  const merged = {
    sessionsDir: process.env.SESSIONS_DIR ?? file.sessionsDir,
    learningEnginePath: process.env.LEARNING_ENGINE_PATH ?? file.learningEnginePath,
    disableProceduralMemory: process.env.DISABLE_PROCEDURAL_MEMORY ?? boolToEnvString(file.disableProceduralMemory),
    disableLearning: process.env.DISABLE_LEARNING ?? boolToEnvString(file.disableLearning),
  };

  return sdkConfigSchema.parse(merged);
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Get the path to the loaded config file, if any.
 * Uses cached path to avoid redundant filesystem scans.
 */
export function getConfigFilePath(): string | null {
  // Force loading if not loaded yet (also caches the path)
  getConfigFile();
  return cachedConfigFilePath;
}

/**
 * Check if a config file exists.
 * Uses cached result to avoid redundant filesystem scans.
 */
export function hasConfigFile(): boolean {
  // Force loading if not loaded yet (also caches the path)
  getConfigFile();
  return cachedConfigFilePath !== null;
}

/**
 * Generate a sample .llmbrowserrc file with all available options.
 */
export function generateSampleConfig(): string {
  const sample = {
    log: {
      level: 'info',
      prettyPrint: false,
    },
    database: {
      sqlitePath: './data/unbrowser.db',
      vectorDbPath: './data/vectors',
      poolSize: 10,
    },
    browserProvider: {
      type: 'local',
      timeout: 30000,
      stealth: false,
    },
    redis: {
      host: 'localhost',
      port: 6379,
      keyPrefix: 'unbrowser:',
    },
    proxy: {
      blockThreshold: 0.3,
      cooldownMinutes: 60,
      enableRiskLearning: true,
    },
    apiServer: {
      port: 3001,
      nodeEnv: 'development',
    },
    mcpServer: {
      debugMode: false,
      adminMode: false,
      tenantId: 'default',
    },
    sdk: {
      sessionsDir: './sessions',
      learningEnginePath: './enhanced-knowledge-base.json',
      disableLearning: false,
    },
  };

  return JSON.stringify(sample, null, 2);
}
