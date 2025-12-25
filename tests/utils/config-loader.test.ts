/**
 * Configuration Loader Tests (D-005)
 *
 * Tests for the .llmbrowserrc configuration file loading system.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  configFileSchema,
  getConfigFile,
  clearConfigFileCache,
  getMergedLogConfig,
  getMergedDatabaseConfig,
  getMergedBrowserProviderConfig,
  getMergedMcpServerConfig,
  getMergedSdkConfig,
  hasConfigFile,
  generateSampleConfig,
  type ConfigFile,
} from '../../src/utils/config-loader.js';

// Store original env vars
const originalEnv = { ...process.env };

// Test directory for config files
const testDir = join(tmpdir(), `llmbrowser-config-test-${Date.now()}`);

describe('ConfigLoader', () => {
  beforeEach(() => {
    // Clear any cached config
    clearConfigFileCache();

    // Reset environment variables
    process.env = { ...originalEnv };

    // Create test directory
    try {
      mkdirSync(testDir, { recursive: true });
    } catch {
      // Directory may already exist
    }
  });

  afterEach(() => {
    // Clean up test files
    for (const name of ['.llmbrowserrc', '.llmbrowserrc.json', '.unbrowserrc']) {
      const path = join(testDir, name);
      try {
        if (existsSync(path)) {
          unlinkSync(path);
        }
      } catch {
        // Ignore cleanup errors
      }
    }

    // Reset environment
    process.env = { ...originalEnv };
  });

  describe('configFileSchema', () => {
    it('should accept valid configuration', () => {
      const config = {
        log: {
          level: 'debug',
          prettyPrint: true,
        },
        browserProvider: {
          type: 'local',
          stealth: true,
          timeout: 60000,
        },
      };

      const result = configFileSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it('should accept empty configuration', () => {
      const result = configFileSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('should accept partial configuration', () => {
      const config = {
        log: {
          level: 'info',
        },
      };

      const result = configFileSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it('should reject invalid log level', () => {
      const config = {
        log: {
          level: 'invalid',
        },
      };

      const result = configFileSchema.safeParse(config);
      expect(result.success).toBe(false);
    });

    it('should reject invalid browser provider type', () => {
      const config = {
        browserProvider: {
          type: 'invalid',
        },
      };

      const result = configFileSchema.safeParse(config);
      expect(result.success).toBe(false);
    });

    it('should reject unknown keys (strict mode)', () => {
      const config = {
        unknownKey: 'value',
      };

      const result = configFileSchema.safeParse(config);
      expect(result.success).toBe(false);
    });

    it('should validate all config sections', () => {
      const config: ConfigFile = {
        log: {
          level: 'debug',
          prettyPrint: true,
        },
        database: {
          sqlitePath: './custom.db',
          poolSize: 20,
        },
        browserProvider: {
          type: 'browserless',
          timeout: 45000,
        },
        redis: {
          host: 'redis.example.com',
          port: 6380,
        },
        proxy: {
          blockThreshold: 0.5,
          enableRiskLearning: true,
        },
        apiServer: {
          port: 8080,
          nodeEnv: 'production',
        },
        mcpServer: {
          debugMode: true,
          adminMode: false,
        },
        sdk: {
          sessionsDir: './my-sessions',
          disableLearning: true,
        },
      };

      const result = configFileSchema.safeParse(config);
      expect(result.success).toBe(true);
    });
  });

  describe('getConfigFile', () => {
    it('should return empty object when no config file exists', () => {
      // Change to a directory without config
      const originalCwd = process.cwd();
      process.chdir(testDir);

      try {
        clearConfigFileCache();
        const config = getConfigFile();
        expect(config).toEqual({});
      } finally {
        process.chdir(originalCwd);
      }
    });

    it('should cache the config file', () => {
      const config1 = getConfigFile();
      const config2 = getConfigFile();
      expect(config1).toBe(config2);
    });

    it('should clear cache when clearConfigFileCache is called', () => {
      const config1 = getConfigFile();
      clearConfigFileCache();
      const config2 = getConfigFile();
      // Objects are equal but not the same reference after cache clear
      expect(config1).not.toBe(config2);
    });
  });

  describe('getMergedLogConfig', () => {
    it('should return defaults when no config or env vars', () => {
      clearConfigFileCache();
      delete process.env.LOG_LEVEL;
      delete process.env.LOG_PRETTY;

      const config = getMergedLogConfig();
      expect(config.level).toBe('info');
      expect(config.prettyPrint).toBe(false);
    });

    it('should use environment variables over config file', () => {
      // Config file would have 'debug', but env var has 'warn'
      process.env.LOG_LEVEL = 'warn';

      const config = getMergedLogConfig();
      expect(config.level).toBe('warn');
    });
  });

  describe('getMergedBrowserProviderConfig', () => {
    it('should return defaults when no config', () => {
      clearConfigFileCache();
      delete process.env.BROWSER_PROVIDER;
      delete process.env.LLM_BROWSER_STEALTH;

      const config = getMergedBrowserProviderConfig();
      expect(config.type).toBe('local');
      expect(config.stealth).toBe(false);
      expect(config.timeout).toBe(30000);
    });

    it('should use environment variable for stealth', () => {
      process.env.LLM_BROWSER_STEALTH = 'true';

      clearConfigFileCache();
      const config = getMergedBrowserProviderConfig();
      expect(config.stealth).toBe(true);
    });
  });

  describe('getMergedMcpServerConfig', () => {
    it('should return defaults when no config', () => {
      clearConfigFileCache();
      delete process.env.LLM_BROWSER_DEBUG_MODE;
      delete process.env.LLM_BROWSER_ADMIN_MODE;
      delete process.env.LLM_BROWSER_TENANT_ID;

      const config = getMergedMcpServerConfig();
      expect(config.debugMode).toBe(false);
      expect(config.adminMode).toBe(false);
      expect(config.tenantId).toBe('default');
    });

    it('should enable debug mode via env var', () => {
      process.env.LLM_BROWSER_DEBUG_MODE = '1';

      clearConfigFileCache();
      const config = getMergedMcpServerConfig();
      expect(config.debugMode).toBe(true);
    });
  });

  describe('getMergedSdkConfig', () => {
    it('should return defaults when no config', () => {
      clearConfigFileCache();
      delete process.env.SESSIONS_DIR;
      delete process.env.LEARNING_ENGINE_PATH;
      delete process.env.DISABLE_LEARNING;

      const config = getMergedSdkConfig();
      expect(config.sessionsDir).toBe('./sessions');
      expect(config.learningEnginePath).toBe('./enhanced-knowledge-base.json');
      expect(config.disableLearning).toBe(false);
    });

    it('should disable learning via env var', () => {
      process.env.DISABLE_LEARNING = 'true';

      clearConfigFileCache();
      const config = getMergedSdkConfig();
      expect(config.disableLearning).toBe(true);
    });
  });

  describe('getMergedDatabaseConfig', () => {
    it('should use sqlite backend by default', () => {
      clearConfigFileCache();
      delete process.env.DATABASE_URL;
      delete process.env.SQLITE_PATH;

      const config = getMergedDatabaseConfig();
      expect(config.backend).toBe('sqlite');
      expect(config.sqlitePath).toBe('./data/unbrowser.db');
    });

    it('should use postgres when DATABASE_URL is set', () => {
      process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';

      clearConfigFileCache();
      const config = getMergedDatabaseConfig();
      expect(config.backend).toBe('postgres');
      expect(config.databaseUrl).toBe('postgresql://user:pass@localhost:5432/db');
    });
  });

  describe('generateSampleConfig', () => {
    it('should generate valid JSON', () => {
      const sample = generateSampleConfig();
      const parsed = JSON.parse(sample);
      expect(parsed).toBeDefined();
    });

    it('should generate valid config', () => {
      const sample = generateSampleConfig();
      const parsed = JSON.parse(sample);
      const result = configFileSchema.safeParse(parsed);
      expect(result.success).toBe(true);
    });

    it('should include all main sections', () => {
      const sample = generateSampleConfig();
      const parsed = JSON.parse(sample);

      expect(parsed.log).toBeDefined();
      expect(parsed.database).toBeDefined();
      expect(parsed.browserProvider).toBeDefined();
      expect(parsed.redis).toBeDefined();
      expect(parsed.proxy).toBeDefined();
      expect(parsed.apiServer).toBeDefined();
      expect(parsed.mcpServer).toBeDefined();
      expect(parsed.sdk).toBeDefined();
    });
  });

  describe('hasConfigFile', () => {
    it('should return false when no config file exists', () => {
      const originalCwd = process.cwd();
      process.chdir(testDir);

      try {
        clearConfigFileCache();
        expect(hasConfigFile()).toBe(false);
      } finally {
        process.chdir(originalCwd);
      }
    });
  });

  describe('Comment stripping', () => {
    it('should handle config with JavaScript-style comments', () => {
      // This test validates the comment stripping logic
      const configWithComments = `{
        // This is a line comment
        "log": {
          "level": "debug" // inline comment
        },
        /* Block comment
           spanning multiple lines */
        "browserProvider": {
          "type": "local"
        }
      }`;

      // Strip comments manually (same logic as loader)
      const stripped = configWithComments
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');

      // Should parse successfully
      const parsed = JSON.parse(stripped);
      expect(parsed.log.level).toBe('debug');
      expect(parsed.browserProvider.type).toBe('local');
    });
  });

  describe('Array config values', () => {
    it('should accept arrays for datacenterUrls', () => {
      const config = {
        proxy: {
          datacenterUrls: ['http://proxy1.com:8080', 'http://proxy2.com:8080'],
        },
      };

      const result = configFileSchema.safeParse(config);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.proxy?.datacenterUrls).toHaveLength(2);
      }
    });

    it('should accept arrays for corsOrigins', () => {
      const config = {
        apiServer: {
          corsOrigins: ['http://localhost:3000', 'https://app.example.com'],
        },
      };

      const result = configFileSchema.safeParse(config);
      expect(result.success).toBe(true);
    });
  });

  describe('Numeric validations', () => {
    it('should reject invalid port numbers', () => {
      const config = {
        apiServer: {
          port: 100000, // > 65535
        },
      };

      const result = configFileSchema.safeParse(config);
      expect(result.success).toBe(false);
    });

    it('should reject invalid pool size', () => {
      const config = {
        database: {
          poolSize: 0, // < 1
        },
      };

      const result = configFileSchema.safeParse(config);
      expect(result.success).toBe(false);
    });

    it('should reject invalid block threshold', () => {
      const config = {
        proxy: {
          blockThreshold: 1.5, // > 1
        },
      };

      const result = configFileSchema.safeParse(config);
      expect(result.success).toBe(false);
    });

    it('should accept valid timeout', () => {
      const config = {
        browserProvider: {
          timeout: 120000, // 2 minutes
        },
      };

      const result = configFileSchema.safeParse(config);
      expect(result.success).toBe(true);
    });
  });

  describe('String validations', () => {
    it('should reject invalid brightdata country code', () => {
      const config = {
        browserProvider: {
          brightdataCountry: 'USA', // Should be 2 chars
        },
      };

      const result = configFileSchema.safeParse(config);
      expect(result.success).toBe(false);
    });

    it('should accept valid 2-letter country code', () => {
      const config = {
        browserProvider: {
          brightdataCountry: 'us',
        },
      };

      const result = configFileSchema.safeParse(config);
      expect(result.success).toBe(true);
    });
  });
});
