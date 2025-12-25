/**
 * Environment Variable Parser (D-009)
 *
 * Type-safe environment variable parsing with validation.
 * Centralizes all env var access and provides clear error messages
 * for misconfiguration.
 */

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
  ConfigValidationError,
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

// ============================================
// ENVIRONMENT VARIABLE MAPPING
// ============================================

/**
 * Map environment variables to configuration object.
 * This creates the structure expected by our schemas.
 */
function mapEnvToLogConfig() {
  return {
    level: process.env.LOG_LEVEL,
    prettyPrint: process.env.LOG_PRETTY,
  };
}

function mapEnvToDatabaseConfig() {
  return {
    databaseUrl: process.env.DATABASE_URL,
    sqlitePath: process.env.SQLITE_PATH,
    vectorDbPath: process.env.VECTOR_DB_PATH,
    poolSize: process.env.DATABASE_POOL_SIZE,
    debugPrisma: process.env.DEBUG_PRISMA,
  };
}

function mapEnvToBrowserProviderConfig() {
  return {
    type: process.env.BROWSER_PROVIDER,
    browserlessToken: process.env.BROWSERLESS_TOKEN,
    browserlessUrl: process.env.BROWSERLESS_URL,
    brightdataAuth: process.env.BRIGHTDATA_AUTH,
    brightdataZone: process.env.BRIGHTDATA_ZONE,
    brightdataCountry: process.env.BRIGHTDATA_COUNTRY,
    customEndpoint: process.env.BROWSER_ENDPOINT,
    timeout: process.env.BROWSER_TIMEOUT,
    stealth: process.env.LLM_BROWSER_STEALTH,
  };
}

function mapEnvToRedisConfig() {
  return {
    url: process.env.REDIS_URL,
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT,
    password: process.env.REDIS_PASSWORD,
    db: process.env.REDIS_DB,
    keyPrefix: process.env.REDIS_KEY_PREFIX,
    connectTimeout: process.env.REDIS_CONNECT_TIMEOUT,
    maxRetriesPerRequest: process.env.REDIS_MAX_RETRIES,
    enableOfflineQueue: process.env.REDIS_OFFLINE_QUEUE,
  };
}

function mapEnvToProxyConfig() {
  return {
    datacenterUrls: process.env.PROXY_DATACENTER_URLS,
    ispUrls: process.env.PROXY_ISP_URLS,
    brightdataAuth: process.env.BRIGHTDATA_AUTH,
    brightdataZone: process.env.BRIGHTDATA_ZONE,
    brightdataCountry: process.env.BRIGHTDATA_COUNTRY,
    brightdataCountries: process.env.BRIGHTDATA_COUNTRIES,
    brightdataSessionRotation: process.env.BRIGHTDATA_SESSION_ROTATION,
    brightdataPort: process.env.BRIGHTDATA_PORT,
    healthWindow: process.env.PROXY_HEALTH_WINDOW,
    cooldownMinutes: process.env.PROXY_COOLDOWN_MINUTES,
    blockThreshold: process.env.PROXY_BLOCK_THRESHOLD,
    riskCacheMinutes: process.env.DOMAIN_RISK_CACHE_MINUTES,
    enableRiskLearning: process.env.DOMAIN_RISK_LEARNING,
  };
}

function mapEnvToApiServerConfig() {
  return {
    nodeEnv: process.env.NODE_ENV,
    port: process.env.PORT,
    corsOrigins: process.env.CORS_ORIGINS,
  };
}

function mapEnvToStripeConfig() {
  return {
    secretKey: process.env.STRIPE_SECRET_KEY,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
    priceId: process.env.STRIPE_PRICE_ID,
    meterEventName: process.env.STRIPE_METER_EVENT_NAME,
  };
}

function mapEnvToMcpServerConfig() {
  return {
    debugMode: process.env.LLM_BROWSER_DEBUG_MODE,
    adminMode: process.env.LLM_BROWSER_ADMIN_MODE,
    tenantId: process.env.LLM_BROWSER_TENANT_ID,
  };
}

function mapEnvToSdkConfig() {
  return {
    sessionsDir: process.env.SESSIONS_DIR,
    learningEnginePath: process.env.LEARNING_ENGINE_PATH,
    disableProceduralMemory: process.env.DISABLE_PROCEDURAL_MEMORY,
    disableLearning: process.env.DISABLE_LEARNING,
  };
}

// ============================================
// INDIVIDUAL CONFIG PARSERS
// ============================================

/**
 * Parse and validate logging configuration from environment.
 */
export function parseLogConfig(): LogConfig {
  const result = logConfigSchema.safeParse(mapEnvToLogConfig());
  if (!result.success) {
    throw new ConfigValidationError('logging', result.error);
  }
  return result.data;
}

/**
 * Parse and validate database configuration from environment.
 */
export function parseDatabaseConfig(): DatabaseConfig {
  const result = databaseConfigSchema.safeParse(mapEnvToDatabaseConfig());
  if (!result.success) {
    throw new ConfigValidationError('database', result.error);
  }
  return result.data;
}

/**
 * Parse and validate browser provider configuration from environment.
 */
export function parseBrowserProviderConfig(): BrowserProviderConfig {
  const result = browserProviderConfigSchema.safeParse(mapEnvToBrowserProviderConfig());
  if (!result.success) {
    throw new ConfigValidationError('browserProvider', result.error);
  }
  return result.data;
}

/**
 * Parse and validate Redis configuration from environment.
 */
export function parseRedisConfig(): RedisConfig {
  const result = redisConfigSchema.safeParse(mapEnvToRedisConfig());
  if (!result.success) {
    throw new ConfigValidationError('redis', result.error);
  }
  return result.data;
}

/**
 * Parse and validate proxy configuration from environment.
 */
export function parseProxyConfig(): ProxyConfig {
  const result = proxyConfigSchema.safeParse(mapEnvToProxyConfig());
  if (!result.success) {
    throw new ConfigValidationError('proxy', result.error);
  }
  return result.data;
}

/**
 * Parse and validate API server configuration from environment.
 */
export function parseApiServerConfig(): ApiServerConfig {
  const result = apiServerConfigSchema.safeParse(mapEnvToApiServerConfig());
  if (!result.success) {
    throw new ConfigValidationError('apiServer', result.error);
  }
  return result.data;
}

/**
 * Parse and validate Stripe configuration from environment.
 */
export function parseStripeConfig(): StripeConfig {
  const result = stripeConfigSchema.safeParse(mapEnvToStripeConfig());
  if (!result.success) {
    throw new ConfigValidationError('stripe', result.error);
  }
  return result.data;
}

/**
 * Parse and validate MCP server configuration from environment.
 */
export function parseMcpServerConfig(): McpServerConfig {
  const result = mcpServerConfigSchema.safeParse(mapEnvToMcpServerConfig());
  if (!result.success) {
    throw new ConfigValidationError('mcpServer', result.error);
  }
  return result.data;
}

/**
 * Parse and validate SDK configuration from environment.
 */
export function parseSdkConfig(): SdkConfig {
  const result = sdkConfigSchema.safeParse(mapEnvToSdkConfig());
  if (!result.success) {
    throw new ConfigValidationError('sdk', result.error);
  }
  return result.data;
}

// ============================================
// UTILITY PARSERS
// ============================================

/**
 * Safe integer parsing with validation.
 * Returns default if value is undefined, NaN, or out of bounds.
 *
 * @deprecated Use Zod schemas with integerStringSchema instead
 */
export function safeParseInt(
  value: string | undefined,
  defaultVal: number,
  options?: { min?: number; max?: number }
): number {
  if (!value) return defaultVal;
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) return defaultVal;
  if (options?.min !== undefined && parsed < options.min) return defaultVal;
  if (options?.max !== undefined && parsed > options.max) return defaultVal;
  return parsed;
}

/**
 * Safe float parsing with validation.
 * Returns default if value is undefined, NaN, or out of bounds.
 *
 * @deprecated Use Zod schemas with rateSchema instead
 */
export function safeParseFloat(
  value: string | undefined,
  defaultVal: number,
  options?: { min?: number; max?: number }
): number {
  if (!value) return defaultVal;
  const parsed = parseFloat(value);
  if (isNaN(parsed)) return defaultVal;
  if (options?.min !== undefined && parsed < options.min) return defaultVal;
  if (options?.max !== undefined && parsed > options.max) return defaultVal;
  return parsed;
}

/**
 * Parse a boolean from environment variable.
 * Recognizes 'true', '1', 'yes' as true; everything else as false.
 *
 * @deprecated Use Zod schemas with booleanStringSchema instead
 */
export function parseBoolean(value: string | undefined): boolean {
  if (!value) return false;
  return ['true', '1', 'yes'].includes(value.toLowerCase());
}

/**
 * Parse a comma-separated list from environment variable.
 *
 * @deprecated Use Zod schemas with commaSeparatedListSchema instead
 */
export function parseCommaSeparated(value: string | undefined): string[] {
  if (!value) return [];
  return value.split(',').map((s) => s.trim()).filter(Boolean);
}

// ============================================
// CONFIG CACHING
// ============================================

let cachedLogConfig: LogConfig | null = null;
let cachedDatabaseConfig: DatabaseConfig | null = null;
let cachedBrowserProviderConfig: BrowserProviderConfig | null = null;
let cachedRedisConfig: RedisConfig | null = null;
let cachedProxyConfig: ProxyConfig | null = null;
let cachedApiServerConfig: ApiServerConfig | null = null;
let cachedStripeConfig: StripeConfig | null = null;
let cachedMcpServerConfig: McpServerConfig | null = null;
let cachedSdkConfig: SdkConfig | null = null;

/**
 * Get cached log configuration (parses once on first call).
 */
export function getLogConfig(): LogConfig {
  if (!cachedLogConfig) {
    cachedLogConfig = parseLogConfig();
  }
  return cachedLogConfig;
}

/**
 * Get cached database configuration (parses once on first call).
 */
export function getDatabaseConfig(): DatabaseConfig {
  if (!cachedDatabaseConfig) {
    cachedDatabaseConfig = parseDatabaseConfig();
  }
  return cachedDatabaseConfig;
}

/**
 * Get cached browser provider configuration (parses once on first call).
 */
export function getBrowserProviderConfig(): BrowserProviderConfig {
  if (!cachedBrowserProviderConfig) {
    cachedBrowserProviderConfig = parseBrowserProviderConfig();
  }
  return cachedBrowserProviderConfig;
}

/**
 * Get cached Redis configuration (parses once on first call).
 */
export function getRedisConfig(): RedisConfig {
  if (!cachedRedisConfig) {
    cachedRedisConfig = parseRedisConfig();
  }
  return cachedRedisConfig;
}

/**
 * Get cached proxy configuration (parses once on first call).
 */
export function getProxyConfig(): ProxyConfig {
  if (!cachedProxyConfig) {
    cachedProxyConfig = parseProxyConfig();
  }
  return cachedProxyConfig;
}

/**
 * Get cached API server configuration (parses once on first call).
 */
export function getApiServerConfig(): ApiServerConfig {
  if (!cachedApiServerConfig) {
    cachedApiServerConfig = parseApiServerConfig();
  }
  return cachedApiServerConfig;
}

/**
 * Get cached Stripe configuration (parses once on first call).
 */
export function getStripeConfig(): StripeConfig {
  if (!cachedStripeConfig) {
    cachedStripeConfig = parseStripeConfig();
  }
  return cachedStripeConfig;
}

/**
 * Get cached MCP server configuration (parses once on first call).
 */
export function getMcpServerConfig(): McpServerConfig {
  if (!cachedMcpServerConfig) {
    cachedMcpServerConfig = parseMcpServerConfig();
  }
  return cachedMcpServerConfig;
}

/**
 * Get cached SDK configuration (parses once on first call).
 */
export function getSdkConfig(): SdkConfig {
  if (!cachedSdkConfig) {
    cachedSdkConfig = parseSdkConfig();
  }
  return cachedSdkConfig;
}

/**
 * Clear all cached configurations.
 * Useful for testing when environment variables change.
 */
export function clearConfigCache(): void {
  cachedLogConfig = null;
  cachedDatabaseConfig = null;
  cachedBrowserProviderConfig = null;
  cachedRedisConfig = null;
  cachedProxyConfig = null;
  cachedApiServerConfig = null;
  cachedStripeConfig = null;
  cachedMcpServerConfig = null;
  cachedSdkConfig = null;
}

// ============================================
// VALIDATION HELPERS
// ============================================

/**
 * Validate all configurations at startup.
 * Call this early in application bootstrap to fail fast on misconfig.
 *
 * @param sections - Optional array of section names to validate.
 *                   If not provided, validates all sections.
 * @throws ConfigValidationError if any configuration is invalid.
 */
export function validateAllConfigs(
  sections?: Array<'log' | 'database' | 'browserProvider' | 'redis' | 'proxy' | 'apiServer' | 'stripe' | 'mcpServer' | 'sdk'>
): void {
  const toValidate = sections ?? ['log', 'database', 'browserProvider', 'redis', 'proxy', 'apiServer', 'stripe', 'mcpServer', 'sdk'];

  const parsers: Record<string, () => unknown> = {
    log: parseLogConfig,
    database: parseDatabaseConfig,
    browserProvider: parseBrowserProviderConfig,
    redis: parseRedisConfig,
    proxy: parseProxyConfig,
    apiServer: parseApiServerConfig,
    stripe: parseStripeConfig,
    mcpServer: parseMcpServerConfig,
    sdk: parseSdkConfig,
  };

  for (const section of toValidate) {
    const parser = parsers[section];
    if (parser) {
      parser(); // Will throw ConfigValidationError if invalid
    }
  }
}

/**
 * Check if a configuration section is valid without throwing.
 *
 * @returns Object with success boolean and optional error message.
 */
export function isConfigValid(
  section: 'log' | 'database' | 'browserProvider' | 'redis' | 'proxy' | 'apiServer' | 'stripe' | 'mcpServer' | 'sdk'
): { valid: boolean; error?: string } {
  const parsers: Record<string, () => unknown> = {
    log: parseLogConfig,
    database: parseDatabaseConfig,
    browserProvider: parseBrowserProviderConfig,
    redis: parseRedisConfig,
    proxy: parseProxyConfig,
    apiServer: parseApiServerConfig,
    stripe: parseStripeConfig,
    mcpServer: parseMcpServerConfig,
    sdk: parseSdkConfig,
  };

  try {
    const parser = parsers[section];
    if (parser) {
      parser();
    }
    return { valid: true };
  } catch (error) {
    if (error instanceof ConfigValidationError) {
      return { valid: false, error: error.message };
    }
    return { valid: false, error: String(error) };
  }
}
