/**
 * Tests for Configuration Validation (D-009)
 *
 * Tests the type-safe configuration validation system including
 * Zod schemas and environment variable parsing.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  logLevelSchema,
  logConfigSchema,
  databaseConfigSchema,
  browserProviderConfigSchema,
  redisConfigSchema,
  proxyConfigSchema,
  apiServerConfigSchema,
  stripeConfigSchema,
  mcpServerConfigSchema,
  sdkConfigSchema,
  booleanStringSchema,
  integerStringSchema,
  rateSchema,
  urlSchema,
  postgresUrlSchema,
  websocketUrlSchema,
  commaSeparatedListSchema,
  formatConfigErrors,
  ConfigValidationError,
} from '../../src/utils/config-schemas.js';
import {
  parseLogConfig,
  parseDatabaseConfig,
  parseBrowserProviderConfig,
  parseRedisConfig,
  parseProxyConfig,
  parseApiServerConfig,
  parseStripeConfig,
  parseMcpServerConfig,
  parseSdkConfig,
  safeParseInt,
  safeParseFloat,
  parseBoolean,
  parseCommaSeparated,
  clearConfigCache,
  validateAllConfigs,
  isConfigValid,
} from '../../src/utils/env-parser.js';

// Store original env vars
let originalEnv: NodeJS.ProcessEnv;

describe('Configuration Validation (D-009)', () => {
  beforeEach(() => {
    // Save original env
    originalEnv = { ...process.env };
    // Clear config cache before each test
    clearConfigCache();
  });

  afterEach(() => {
    // Restore original env
    process.env = originalEnv;
    clearConfigCache();
  });

  // ============================================
  // HELPER SCHEMAS
  // ============================================

  describe('booleanStringSchema', () => {
    it('should parse "true" as true', () => {
      const result = booleanStringSchema.parse('true');
      expect(result).toBe(true);
    });

    it('should parse "1" as true', () => {
      const result = booleanStringSchema.parse('1');
      expect(result).toBe(true);
    });

    it('should parse "yes" as true', () => {
      const result = booleanStringSchema.parse('yes');
      expect(result).toBe(true);
    });

    it('should parse "TRUE" as true (case insensitive)', () => {
      const result = booleanStringSchema.parse('TRUE');
      expect(result).toBe(true);
    });

    it('should parse "false" as false', () => {
      const result = booleanStringSchema.parse('false');
      expect(result).toBe(false);
    });

    it('should parse undefined as false', () => {
      const result = booleanStringSchema.parse(undefined);
      expect(result).toBe(false);
    });

    it('should parse random string as false', () => {
      const result = booleanStringSchema.parse('random');
      expect(result).toBe(false);
    });
  });

  describe('integerStringSchema', () => {
    it('should parse valid integer string', () => {
      const schema = integerStringSchema({ min: 1, max: 100 });
      const result = schema.parse('50');
      expect(result).toBe(50);
    });

    it('should use default when not provided', () => {
      const schema = integerStringSchema({ default: 42 });
      const result = schema.parse(undefined);
      expect(result).toBe(42);
    });

    it('should reject value below min', () => {
      const schema = integerStringSchema({ min: 10 });
      expect(() => schema.parse('5')).toThrow();
    });

    it('should reject value above max', () => {
      const schema = integerStringSchema({ max: 100 });
      expect(() => schema.parse('150')).toThrow();
    });

    it('should reject non-integer values', () => {
      const schema = integerStringSchema();
      expect(() => schema.parse('3.14')).toThrow();
    });
  });

  describe('rateSchema', () => {
    it('should parse valid rate (0.5)', () => {
      const schema = rateSchema();
      const result = schema.parse('0.5');
      expect(result).toBe(0.5);
    });

    it('should accept 0', () => {
      const schema = rateSchema();
      const result = schema.parse('0');
      expect(result).toBe(0);
    });

    it('should accept 1', () => {
      const schema = rateSchema();
      const result = schema.parse('1');
      expect(result).toBe(1);
    });

    it('should reject value above 1', () => {
      const schema = rateSchema();
      expect(() => schema.parse('1.5')).toThrow();
    });

    it('should reject negative value', () => {
      const schema = rateSchema();
      expect(() => schema.parse('-0.1')).toThrow();
    });

    it('should use default when provided', () => {
      const schema = rateSchema(0.3);
      const result = schema.parse(undefined);
      expect(result).toBe(0.3);
    });
  });

  describe('urlSchema', () => {
    it('should accept valid HTTP URL', () => {
      const result = urlSchema.parse('http://example.com');
      expect(result).toBe('http://example.com');
    });

    it('should accept valid HTTPS URL', () => {
      const result = urlSchema.parse('https://example.com/path?query=1');
      expect(result).toBe('https://example.com/path?query=1');
    });

    it('should reject invalid URL', () => {
      expect(() => urlSchema.parse('not-a-url')).toThrow();
    });
  });

  describe('postgresUrlSchema', () => {
    it('should accept postgres:// URL', () => {
      const result = postgresUrlSchema.parse('postgres://user:pass@host:5432/db');
      expect(result).toBe('postgres://user:pass@host:5432/db');
    });

    it('should accept postgresql:// URL', () => {
      const result = postgresUrlSchema.parse('postgresql://user:pass@host:5432/db');
      expect(result).toBe('postgresql://user:pass@host:5432/db');
    });

    it('should reject MySQL URL', () => {
      expect(() => postgresUrlSchema.parse('mysql://user:pass@host:3306/db')).toThrow();
    });

    it('should reject HTTP URL', () => {
      expect(() => postgresUrlSchema.parse('http://example.com')).toThrow();
    });
  });

  describe('websocketUrlSchema', () => {
    it('should accept wss:// URL', () => {
      const result = websocketUrlSchema.parse('wss://example.com/socket');
      expect(result).toBe('wss://example.com/socket');
    });

    it('should accept ws:// URL', () => {
      const result = websocketUrlSchema.parse('ws://localhost:8080');
      expect(result).toBe('ws://localhost:8080');
    });

    it('should reject http:// URL', () => {
      expect(() => websocketUrlSchema.parse('http://example.com')).toThrow();
    });
  });

  describe('commaSeparatedListSchema', () => {
    it('should parse comma-separated values', () => {
      const result = commaSeparatedListSchema.parse('a,b,c');
      expect(result).toEqual(['a', 'b', 'c']);
    });

    it('should trim whitespace', () => {
      const result = commaSeparatedListSchema.parse('a , b , c');
      expect(result).toEqual(['a', 'b', 'c']);
    });

    it('should filter empty values', () => {
      const result = commaSeparatedListSchema.parse('a,,b,,c');
      expect(result).toEqual(['a', 'b', 'c']);
    });

    it('should handle single value', () => {
      const result = commaSeparatedListSchema.parse('single');
      expect(result).toEqual(['single']);
    });
  });

  // ============================================
  // LOG CONFIG SCHEMA
  // ============================================

  describe('logConfigSchema', () => {
    it('should use defaults when no values provided', () => {
      const result = logConfigSchema.parse({});
      expect(result.level).toBe('info');
      expect(result.prettyPrint).toBe(false);
    });

    it('should accept valid log level', () => {
      const result = logConfigSchema.parse({ level: 'debug' });
      expect(result.level).toBe('debug');
    });

    it('should reject invalid log level', () => {
      expect(() => logConfigSchema.parse({ level: 'invalid' })).toThrow();
    });

    it('should parse prettyPrint boolean string', () => {
      const result = logConfigSchema.parse({ prettyPrint: 'true' });
      expect(result.prettyPrint).toBe(true);
    });
  });

  describe('logLevelSchema', () => {
    it('should accept all valid log levels', () => {
      const levels = ['debug', 'info', 'warn', 'error', 'silent'];
      for (const level of levels) {
        const result = logLevelSchema.parse(level);
        expect(result).toBe(level);
      }
    });

    it('should reject invalid log level', () => {
      expect(() => logLevelSchema.parse('trace')).toThrow();
    });
  });

  // ============================================
  // DATABASE CONFIG SCHEMA
  // ============================================

  describe('databaseConfigSchema', () => {
    it('should return sqlite config when no DATABASE_URL', () => {
      const result = databaseConfigSchema.parse({});
      expect(result.backend).toBe('sqlite');
      if (result.backend === 'sqlite') {
        expect(result.sqlitePath).toBe('./data/unbrowser.db');
        expect(result.vectorDbPath).toBe('./data/vectors');
        expect(result.pooling).toBe(false);
      }
    });

    it('should return postgres config when DATABASE_URL provided', () => {
      const result = databaseConfigSchema.parse({
        databaseUrl: 'postgres://user:pass@host:5432/db',
      });
      expect(result.backend).toBe('postgres');
      if (result.backend === 'postgres') {
        expect(result.databaseUrl).toBe('postgres://user:pass@host:5432/db');
        expect(result.pooling).toBe(true);
        expect(result.poolSize).toBe(10);
      }
    });

    it('should parse custom pool size', () => {
      const result = databaseConfigSchema.parse({
        databaseUrl: 'postgres://user:pass@host:5432/db',
        poolSize: '20',
      });
      if (result.backend === 'postgres') {
        expect(result.poolSize).toBe(20);
      }
    });

    it('should reject invalid postgres URL', () => {
      expect(() =>
        databaseConfigSchema.parse({
          databaseUrl: 'mysql://user:pass@host:3306/db',
        })
      ).toThrow();
    });
  });

  // ============================================
  // BROWSER PROVIDER CONFIG SCHEMA
  // ============================================

  describe('browserProviderConfigSchema', () => {
    it('should use local provider by default', () => {
      const result = browserProviderConfigSchema.parse({});
      expect(result.type).toBe('local');
    });

    it('should accept valid provider types', () => {
      const types = ['local', 'browserless', 'brightdata', 'custom'];
      for (const type of types) {
        const result = browserProviderConfigSchema.parse({ type });
        expect(result.type).toBe(type);
      }
    });

    it('should reject invalid provider type', () => {
      expect(() =>
        browserProviderConfigSchema.parse({ type: 'invalid' })
      ).toThrow();
    });

    it('should validate brightdata auth format', () => {
      const result = browserProviderConfigSchema.parse({
        brightdataAuth: 'user:password',
      });
      expect(result.brightdataAuth).toBe('user:password');
    });

    it('should reject invalid brightdata auth format', () => {
      expect(() =>
        browserProviderConfigSchema.parse({
          brightdataAuth: 'invalid-no-colon',
        })
      ).toThrow();
    });

    it('should validate country code length', () => {
      const result = browserProviderConfigSchema.parse({
        brightdataCountry: 'US',
      });
      expect(result.brightdataCountry).toBe('US');
    });

    it('should reject invalid country code length', () => {
      expect(() =>
        browserProviderConfigSchema.parse({
          brightdataCountry: 'USA',
        })
      ).toThrow();
    });
  });

  // ============================================
  // REDIS CONFIG SCHEMA
  // ============================================

  describe('redisConfigSchema', () => {
    it('should use defaults when no values provided', () => {
      const result = redisConfigSchema.parse({});
      expect(result.host).toBe('localhost');
      expect(result.port).toBe(6379);
      expect(result.db).toBe(0);
      expect(result.keyPrefix).toBe('unbrowser:');
    });

    it('should parse custom port', () => {
      const result = redisConfigSchema.parse({ port: '6380' });
      expect(result.port).toBe(6380);
    });

    it('should reject invalid port', () => {
      expect(() => redisConfigSchema.parse({ port: '70000' })).toThrow();
    });

    it('should reject negative port', () => {
      expect(() => redisConfigSchema.parse({ port: '-1' })).toThrow();
    });
  });

  // ============================================
  // PROXY CONFIG SCHEMA
  // ============================================

  describe('proxyConfigSchema', () => {
    it('should use defaults when no values provided', () => {
      const result = proxyConfigSchema.parse({});
      expect(result.brightdataZone).toBe('residential');
      expect(result.healthWindow).toBe(100);
      expect(result.cooldownMinutes).toBe(60);
      expect(result.blockThreshold).toBe(0.3);
    });

    it('should parse datacenter URLs as list', () => {
      const result = proxyConfigSchema.parse({
        datacenterUrls: 'http://proxy1:8080,http://proxy2:8080',
      });
      expect(result.datacenterUrls).toEqual(['http://proxy1:8080', 'http://proxy2:8080']);
    });

    it('should validate block threshold as rate', () => {
      const result = proxyConfigSchema.parse({ blockThreshold: '0.5' });
      expect(result.blockThreshold).toBe(0.5);
    });

    it('should reject block threshold above 1', () => {
      expect(() => proxyConfigSchema.parse({ blockThreshold: '1.5' })).toThrow();
    });
  });

  // ============================================
  // API SERVER CONFIG SCHEMA
  // ============================================

  describe('apiServerConfigSchema', () => {
    it('should use defaults when no values provided', () => {
      const result = apiServerConfigSchema.parse({});
      expect(result.nodeEnv).toBe('development');
      expect(result.port).toBe(3001);
    });

    it('should accept valid NODE_ENV values', () => {
      const envs = ['development', 'production', 'test'];
      for (const env of envs) {
        const result = apiServerConfigSchema.parse({ nodeEnv: env });
        expect(result.nodeEnv).toBe(env);
      }
    });

    it('should reject invalid NODE_ENV', () => {
      expect(() => apiServerConfigSchema.parse({ nodeEnv: 'staging' })).toThrow();
    });

    it('should parse custom port', () => {
      const result = apiServerConfigSchema.parse({ port: '8080' });
      expect(result.port).toBe(8080);
    });
  });

  // ============================================
  // STRIPE CONFIG SCHEMA
  // ============================================

  describe('stripeConfigSchema', () => {
    it('should allow empty config (all optional)', () => {
      const result = stripeConfigSchema.parse({});
      expect(result.secretKey).toBeUndefined();
    });

    it('should validate secret key prefix', () => {
      const result = stripeConfigSchema.parse({
        secretKey: 'sk_test_abc123',
      });
      expect(result.secretKey).toBe('sk_test_abc123');
    });

    it('should reject invalid secret key prefix', () => {
      expect(() =>
        stripeConfigSchema.parse({
          secretKey: 'invalid_key',
        })
      ).toThrow();
    });

    it('should validate webhook secret prefix', () => {
      const result = stripeConfigSchema.parse({
        webhookSecret: 'whsec_abc123',
      });
      expect(result.webhookSecret).toBe('whsec_abc123');
    });

    it('should reject invalid webhook secret prefix', () => {
      expect(() =>
        stripeConfigSchema.parse({
          webhookSecret: 'invalid_secret',
        })
      ).toThrow();
    });
  });

  // ============================================
  // MCP SERVER CONFIG SCHEMA
  // ============================================

  describe('mcpServerConfigSchema', () => {
    it('should use defaults when no values provided', () => {
      const result = mcpServerConfigSchema.parse({});
      expect(result.debugMode).toBe(false);
      expect(result.adminMode).toBe(false);
      expect(result.tenantId).toBe('default');
    });

    it('should parse debug mode', () => {
      const result = mcpServerConfigSchema.parse({ debugMode: 'true' });
      expect(result.debugMode).toBe(true);
    });

    it('should parse admin mode', () => {
      const result = mcpServerConfigSchema.parse({ adminMode: '1' });
      expect(result.adminMode).toBe(true);
    });
  });

  // ============================================
  // SDK CONFIG SCHEMA
  // ============================================

  describe('sdkConfigSchema', () => {
    it('should use defaults when no values provided', () => {
      const result = sdkConfigSchema.parse({});
      expect(result.sessionsDir).toBe('./sessions');
      expect(result.learningEnginePath).toBe('./enhanced-knowledge-base.json');
      expect(result.disableProceduralMemory).toBe(false);
      expect(result.disableLearning).toBe(false);
    });

    it('should parse disable flags', () => {
      const result = sdkConfigSchema.parse({
        disableProceduralMemory: 'true',
        disableLearning: 'true',
      });
      expect(result.disableProceduralMemory).toBe(true);
      expect(result.disableLearning).toBe(true);
    });
  });

  // ============================================
  // ENV PARSER FUNCTIONS
  // ============================================

  describe('parseLogConfig', () => {
    it('should parse log config from environment', () => {
      process.env.LOG_LEVEL = 'debug';
      process.env.LOG_PRETTY = 'true';

      const config = parseLogConfig();
      expect(config.level).toBe('debug');
      expect(config.prettyPrint).toBe(true);
    });
  });

  describe('parseDatabaseConfig', () => {
    it('should parse database config from environment', () => {
      process.env.DATABASE_URL = 'postgres://user:pass@host:5432/db';
      process.env.DATABASE_POOL_SIZE = '15';

      const config = parseDatabaseConfig();
      expect(config.backend).toBe('postgres');
      if (config.backend === 'postgres') {
        expect(config.poolSize).toBe(15);
      }
    });
  });

  describe('parseMcpServerConfig', () => {
    it('should parse MCP server config from environment', () => {
      process.env.LLM_BROWSER_DEBUG_MODE = 'true';
      process.env.LLM_BROWSER_ADMIN_MODE = 'true';
      process.env.LLM_BROWSER_TENANT_ID = 'test-tenant';

      const config = parseMcpServerConfig();
      expect(config.debugMode).toBe(true);
      expect(config.adminMode).toBe(true);
      expect(config.tenantId).toBe('test-tenant');
    });
  });

  // ============================================
  // UTILITY FUNCTIONS (DEPRECATED)
  // ============================================

  describe('safeParseInt (deprecated)', () => {
    it('should parse valid integer', () => {
      expect(safeParseInt('42', 0)).toBe(42);
    });

    it('should return default for undefined', () => {
      expect(safeParseInt(undefined, 10)).toBe(10);
    });

    it('should return default for NaN', () => {
      expect(safeParseInt('not-a-number', 10)).toBe(10);
    });

    it('should return default for value below min', () => {
      expect(safeParseInt('5', 10, { min: 10 })).toBe(10);
    });

    it('should return default for value above max', () => {
      expect(safeParseInt('150', 10, { max: 100 })).toBe(10);
    });
  });

  describe('safeParseFloat (deprecated)', () => {
    it('should parse valid float', () => {
      expect(safeParseFloat('3.14', 0)).toBeCloseTo(3.14);
    });

    it('should return default for undefined', () => {
      expect(safeParseFloat(undefined, 1.5)).toBe(1.5);
    });

    it('should return default for NaN', () => {
      expect(safeParseFloat('not-a-number', 1.5)).toBe(1.5);
    });
  });

  describe('parseBoolean (deprecated)', () => {
    it('should parse "true" as true', () => {
      expect(parseBoolean('true')).toBe(true);
    });

    it('should parse "1" as true', () => {
      expect(parseBoolean('1')).toBe(true);
    });

    it('should parse undefined as false', () => {
      expect(parseBoolean(undefined)).toBe(false);
    });
  });

  describe('parseCommaSeparated (deprecated)', () => {
    it('should parse comma-separated values', () => {
      expect(parseCommaSeparated('a,b,c')).toEqual(['a', 'b', 'c']);
    });

    it('should return empty array for undefined', () => {
      expect(parseCommaSeparated(undefined)).toEqual([]);
    });
  });

  // ============================================
  // VALIDATION HELPERS
  // ============================================

  describe('validateAllConfigs', () => {
    it('should pass with valid default config', () => {
      // Clear any problematic env vars
      delete process.env.STRIPE_SECRET_KEY;
      delete process.env.STRIPE_WEBHOOK_SECRET;

      expect(() => validateAllConfigs(['log', 'mcpServer', 'sdk'])).not.toThrow();
    });

    it('should validate specific sections only', () => {
      expect(() => validateAllConfigs(['log'])).not.toThrow();
    });
  });

  describe('isConfigValid', () => {
    it('should return valid for good config', () => {
      const result = isConfigValid('log');
      expect(result.valid).toBe(true);
    });

    it('should return error for invalid config', () => {
      process.env.LOG_LEVEL = 'invalid-level';
      const result = isConfigValid('log');
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  // ============================================
  // ERROR FORMATTING
  // ============================================

  describe('formatConfigErrors', () => {
    it('should format validation errors nicely', () => {
      const result = logConfigSchema.safeParse({ level: 'invalid' });
      if (!result.success) {
        const formatted = formatConfigErrors(result.error);
        expect(formatted).toContain('level');
      }
    });
  });

  describe('ConfigValidationError', () => {
    it('should create error with helpful message', () => {
      const result = logConfigSchema.safeParse({ level: 'invalid' });
      if (!result.success) {
        const error = new ConfigValidationError('logging', result.error);
        expect(error.name).toBe('ConfigValidationError');
        expect(error.message).toContain('logging');
        expect(error.message).toContain('environment variables');
      }
    });
  });

  // ============================================
  // CONFIG CACHING
  // ============================================

  describe('clearConfigCache', () => {
    it('should clear all cached configs', () => {
      // First parse should cache
      process.env.LOG_LEVEL = 'debug';
      const config1 = parseLogConfig();
      expect(config1.level).toBe('debug');

      // Change env
      process.env.LOG_LEVEL = 'error';

      // Without clearing, should return cached value
      // (In practice, parseLogConfig doesn't cache - use getLogConfig)

      // Clear cache
      clearConfigCache();

      // Now should get new value
      const config2 = parseLogConfig();
      expect(config2.level).toBe('error');
    });
  });
});
