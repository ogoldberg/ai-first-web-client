/**
 * Configuration Schemas (D-009)
 *
 * Centralized Zod schemas for type-safe runtime configuration validation.
 * All environment variable parsing goes through these schemas for consistent
 * validation and clear error messages.
 */

import { z } from 'zod';

// ============================================
// HELPER SCHEMAS
// ============================================

/**
 * Schema for parsing a string as a boolean.
 * Recognizes 'true', '1', 'yes' as true; everything else as false.
 */
export const booleanStringSchema = z
  .string()
  .optional()
  .transform((val) => {
    if (!val) return false;
    return ['true', '1', 'yes'].includes(val.toLowerCase());
  });

/**
 * Schema for parsing a string as an integer with bounds.
 */
export function integerStringSchema(options?: {
  min?: number;
  max?: number;
  default?: number;
}) {
  const { min, max } = options ?? {};
  let schema = z.coerce.number().int();

  if (min !== undefined) schema = schema.min(min);
  if (max !== undefined) schema = schema.max(max);

  if (options?.default !== undefined) {
    return schema.default(options.default);
  }
  return schema;
}

/**
 * Schema for parsing a string as a float between 0 and 1 (percentage/rate).
 */
export function rateSchema(defaultVal?: number) {
  const schema = z.coerce.number().min(0).max(1);
  if (defaultVal !== undefined) {
    return schema.default(defaultVal);
  }
  return schema;
}

/**
 * Schema for a valid URL string.
 */
export const urlSchema = z.string().url();

/**
 * Schema for a valid PostgreSQL URL.
 */
export const postgresUrlSchema = z
  .string()
  .refine(
    (url) => url.startsWith('postgres://') || url.startsWith('postgresql://'),
    { message: 'Must be a valid PostgreSQL URL starting with postgres:// or postgresql://' }
  );

/**
 * Schema for a valid WebSocket URL.
 */
export const websocketUrlSchema = z
  .string()
  .refine(
    (url) => url.startsWith('ws://') || url.startsWith('wss://'),
    { message: 'Must be a valid WebSocket URL starting with ws:// or wss://' }
  );

/**
 * Schema for a comma-separated list of strings.
 */
export const commaSeparatedListSchema = z
  .string()
  .transform((val) => val.split(',').map((s) => s.trim()).filter(Boolean));

// ============================================
// LOG LEVEL SCHEMA
// ============================================

export const logLevelSchema = z.enum(['debug', 'info', 'warn', 'error', 'silent']);
export type LogLevel = z.infer<typeof logLevelSchema>;

export const logConfigSchema = z.object({
  level: logLevelSchema.default('info'),
  prettyPrint: booleanStringSchema.default(false),
});

export type LogConfig = z.infer<typeof logConfigSchema>;

// ============================================
// DATABASE CONFIGURATION
// ============================================

export const databaseConfigSchema = z
  .object({
    databaseUrl: postgresUrlSchema.optional(),
    sqlitePath: z.string().default('./data/unbrowser.db'),
    vectorDbPath: z.string().default('./data/vectors'),
    poolSize: integerStringSchema({ min: 1, max: 100, default: 10 }),
    debugPrisma: booleanStringSchema.default(false),
  })
  .transform((config) => {
    // Determine backend based on databaseUrl
    if (config.databaseUrl) {
      return {
        backend: 'postgres' as const,
        databaseUrl: config.databaseUrl,
        pooling: true,
        poolSize: config.poolSize,
        debugPrisma: config.debugPrisma,
      };
    }
    return {
      backend: 'sqlite' as const,
      sqlitePath: config.sqlitePath,
      vectorDbPath: config.vectorDbPath,
      pooling: false,
      debugPrisma: config.debugPrisma,
    };
  });

export type DatabaseConfig = z.infer<typeof databaseConfigSchema>;

// ============================================
// BROWSER PROVIDER CONFIGURATION
// ============================================

export const browserProviderTypeSchema = z.enum(['local', 'browserless', 'brightdata', 'custom']);
export type BrowserProviderType = z.infer<typeof browserProviderTypeSchema>;

export const browserProviderConfigSchema = z.object({
  type: browserProviderTypeSchema.default('local'),
  browserlessToken: z.string().optional(),
  browserlessUrl: websocketUrlSchema.optional().default('wss://chrome.browserless.io'),
  brightdataAuth: z.string().regex(/^[^:]+:.+$/, {
    message: 'Bright Data auth must be in format username:password',
  }).optional(),
  brightdataZone: z.enum(['residential', 'unblocker', 'datacenter', 'isp', 'scraping_browser']).optional().default('scraping_browser'),
  brightdataCountry: z.string().length(2).optional(),
  customEndpoint: websocketUrlSchema.optional(),
  timeout: integerStringSchema({ min: 1000, max: 300000, default: 30000 }),
  stealth: booleanStringSchema.default(false),
});

export type BrowserProviderConfig = z.infer<typeof browserProviderConfigSchema>;

// ============================================
// REDIS CONFIGURATION
// ============================================

export const redisConfigSchema = z.object({
  url: urlSchema.optional(),
  host: z.string().optional().default('localhost'),
  port: integerStringSchema({ min: 1, max: 65535, default: 6379 }),
  password: z.string().optional(),
  db: integerStringSchema({ min: 0, max: 15, default: 0 }),
  keyPrefix: z.string().optional().default('unbrowser:'),
  connectTimeout: integerStringSchema({ min: 100, max: 60000, default: 5000 }),
  maxRetriesPerRequest: integerStringSchema({ min: 0, max: 10, default: 3 }),
  enableOfflineQueue: booleanStringSchema.default(false),
});

export type RedisConfig = z.infer<typeof redisConfigSchema>;

// ============================================
// PROXY CONFIGURATION
// ============================================

export const brightDataZoneSchema = z.enum(['residential', 'unblocker', 'datacenter', 'isp']);
export type BrightDataZone = z.infer<typeof brightDataZoneSchema>;

export const proxyConfigSchema = z.object({
  datacenterUrls: commaSeparatedListSchema.optional(),
  ispUrls: commaSeparatedListSchema.optional(),
  brightdataAuth: z.string().regex(/^[^:]+:.+$/, {
    message: 'Bright Data auth must be in format username:password',
  }).optional(),
  brightdataZone: brightDataZoneSchema.optional().default('residential'),
  brightdataCountry: z.string().length(2).optional(),
  brightdataCountries: commaSeparatedListSchema.optional(),
  brightdataSessionRotation: booleanStringSchema.default(true),
  brightdataPort: integerStringSchema({ min: 1, max: 65535, default: 22225 }),
  healthWindow: integerStringSchema({ min: 10, max: 1000, default: 100 }),
  cooldownMinutes: integerStringSchema({ min: 1, max: 1440, default: 60 }),
  blockThreshold: rateSchema(0.3),
  riskCacheMinutes: integerStringSchema({ min: 1, max: 1440, default: 60 }),
  enableRiskLearning: booleanStringSchema.default(true),
});

export type ProxyConfig = z.infer<typeof proxyConfigSchema>;

// ============================================
// API SERVER CONFIGURATION
// ============================================

export const nodeEnvSchema = z.enum(['development', 'production', 'test']);
export type NodeEnv = z.infer<typeof nodeEnvSchema>;

export const apiServerConfigSchema = z.object({
  nodeEnv: nodeEnvSchema.default('development'),
  port: integerStringSchema({ min: 1, max: 65535, default: 3001 }),
  corsOrigins: commaSeparatedListSchema.optional(),
});

export type ApiServerConfig = z.infer<typeof apiServerConfigSchema>;

// ============================================
// STRIPE CONFIGURATION
// ============================================

export const stripeConfigSchema = z.object({
  secretKey: z.string().startsWith('sk_', {
    message: 'Stripe secret key must start with sk_',
  }).optional(),
  webhookSecret: z.string().startsWith('whsec_', {
    message: 'Stripe webhook secret must start with whsec_',
  }).optional(),
  priceId: z.string().startsWith('price_', {
    message: 'Stripe price ID must start with price_',
  }).optional(),
  meterEventName: z.string().optional(),
});

export type StripeConfig = z.infer<typeof stripeConfigSchema>;

// ============================================
// MCP SERVER CONFIGURATION
// ============================================

export const mcpServerConfigSchema = z.object({
  debugMode: booleanStringSchema.default(false),
  adminMode: booleanStringSchema.default(false),
  tenantId: z.string().optional().default('default'),
});

export type McpServerConfig = z.infer<typeof mcpServerConfigSchema>;

// ============================================
// SDK CONFIGURATION
// ============================================

export const sdkConfigSchema = z.object({
  sessionsDir: z.string().optional().default('./sessions'),
  learningEnginePath: z.string().optional().default('./enhanced-knowledge-base.json'),
  disableProceduralMemory: booleanStringSchema.default(false),
  disableLearning: booleanStringSchema.default(false),
});

export type SdkConfig = z.infer<typeof sdkConfigSchema>;

// ============================================
// COMPLETE APPLICATION CONFIGURATION
// ============================================

/**
 * Complete validated configuration for the application.
 * All environment variables are parsed and validated through this schema.
 */
export const appConfigSchema = z.object({
  log: logConfigSchema,
  database: databaseConfigSchema,
  browserProvider: browserProviderConfigSchema,
  redis: redisConfigSchema,
  proxy: proxyConfigSchema,
  apiServer: apiServerConfigSchema,
  stripe: stripeConfigSchema,
  mcpServer: mcpServerConfigSchema,
  sdk: sdkConfigSchema,
});

export type AppConfig = z.infer<typeof appConfigSchema>;

// ============================================
// ERROR FORMATTING
// ============================================

/**
 * Format Zod validation errors into readable messages.
 */
export function formatConfigErrors(error: z.ZodError<unknown>): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.join('.');
      return `  - ${path}: ${issue.message}`;
    })
    .join('\n');
}

/**
 * Create a configuration validation error with helpful messages.
 */
export class ConfigValidationError extends Error {
  constructor(
    public readonly section: string,
    public readonly zodError: z.ZodError
  ) {
    const formatted = formatConfigErrors(zodError);
    super(
      `Configuration validation failed for ${section}:\n${formatted}\n\n` +
      `Please check your environment variables or configuration file.`
    );
    this.name = 'ConfigValidationError';
  }
}
