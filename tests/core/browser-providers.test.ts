import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createProvider,
  getProviderInfo,
  type BrowserProviderType,
} from '../../src/core/browser-providers.js';

describe('Browser Providers', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Clear all browser-related env vars before each test
    delete process.env.BROWSER_PROVIDER;
    delete process.env.BROWSER_ENDPOINT;
    delete process.env.BROWSERLESS_TOKEN;
    delete process.env.BROWSERLESS_URL;
    delete process.env.BRIGHTDATA_AUTH;
    delete process.env.BRIGHTDATA_ZONE;
    delete process.env.BRIGHTDATA_COUNTRY;
  });

  afterEach(() => {
    // Restore original environment
    process.env = { ...originalEnv };
  });

  describe('createProvider', () => {
    describe('Local Provider (default)', () => {
      it('should create local provider when no env vars set', () => {
        const provider = createProvider();

        expect(provider.type).toBe('local');
        expect(provider.name).toBe('Local Playwright');
        expect(provider.getEndpoint()).toBe('');
        expect(provider.validate().valid).toBe(true);
      });

      it('should create local provider when explicitly specified', () => {
        const provider = createProvider({ type: 'local' });

        expect(provider.type).toBe('local');
        expect(provider.capabilities.unlimitedBandwidth).toBe(true);
        expect(provider.capabilities.antiBot).toBe(false);
      });
    });

    describe('Browserless Provider', () => {
      it('should create browserless provider from env var', () => {
        process.env.BROWSERLESS_TOKEN = 'test-token-123';

        const provider = createProvider();

        expect(provider.type).toBe('browserless');
        expect(provider.name).toBe('Browserless.io');
        expect(provider.validate().valid).toBe(true);
      });

      it('should create browserless provider from config', () => {
        const provider = createProvider({
          type: 'browserless',
          browserlessToken: 'my-token',
        });

        expect(provider.type).toBe('browserless');
        const endpoint = provider.getEndpoint();
        expect(endpoint).toContain('token=my-token');
        expect(endpoint).toContain('stealth=true');
        expect(endpoint).toContain('blockAds=true');
      });

      it('should fail validation without token', () => {
        const provider = createProvider({ type: 'browserless' });

        const validation = provider.validate();
        expect(validation.valid).toBe(false);
        expect(validation.error).toContain('BROWSERLESS_TOKEN');
      });

      it('should use custom browserless URL if provided', () => {
        const provider = createProvider({
          type: 'browserless',
          browserlessToken: 'token',
          browserlessUrl: 'wss://custom.browserless.io',
        });

        expect(provider.getEndpoint()).toContain('custom.browserless.io');
      });
    });

    describe('Bright Data Provider', () => {
      it('should create brightdata provider from env var', () => {
        process.env.BRIGHTDATA_AUTH = 'customer123:password456';

        const provider = createProvider();

        expect(provider.type).toBe('brightdata');
        expect(provider.name).toBe('Bright Data Scraping Browser');
        expect(provider.validate().valid).toBe(true);
      });

      it('should create brightdata provider from config', () => {
        const provider = createProvider({
          type: 'brightdata',
          brightdataAuth: 'customer:pass',
        });

        expect(provider.type).toBe('brightdata');
        expect(provider.capabilities.antiBot).toBe(true);
        expect(provider.capabilities.geoTargeting).toBe(true);
        expect(provider.capabilities.residential).toBe(true);
      });

      it('should build correct endpoint URL', () => {
        const provider = createProvider({
          type: 'brightdata',
          brightdataAuth: 'customer123:mypassword',
          brightdataZone: 'scraping_browser',
        });

        const endpoint = provider.getEndpoint();
        expect(endpoint).toContain('customer123');
        expect(endpoint).toContain('scraping_browser');
        expect(endpoint).toContain('brd.superproxy.io:9222');
      });

      it('should include country in endpoint when specified', () => {
        const provider = createProvider({
          type: 'brightdata',
          brightdataAuth: 'customer:pass',
          brightdataCountry: 'us',
        });

        const endpoint = provider.getEndpoint();
        expect(endpoint).toContain('-country-us');
      });

      it('should fail validation without auth', () => {
        const provider = createProvider({ type: 'brightdata' });

        const validation = provider.validate();
        expect(validation.valid).toBe(false);
        expect(validation.error).toContain('BRIGHTDATA_AUTH');
      });

      it('should fail validation with invalid auth format', () => {
        const provider = createProvider({
          type: 'brightdata',
          brightdataAuth: 'invalid-no-colon',
        });

        const validation = provider.validate();
        expect(validation.valid).toBe(false);
        expect(validation.error).toContain('customer_id:password');
      });

      it('should fail validation with empty username', () => {
        const provider = createProvider({
          type: 'brightdata',
          brightdataAuth: ':password',
        });

        const validation = provider.validate();
        expect(validation.valid).toBe(false);
        expect(validation.error).toContain('customer_id:password');
      });

      it('should fail validation with empty password', () => {
        const provider = createProvider({
          type: 'brightdata',
          brightdataAuth: 'customer:',
        });

        const validation = provider.validate();
        expect(validation.valid).toBe(false);
        expect(validation.error).toContain('customer_id:password');
      });
    });

    describe('Custom Provider', () => {
      it('should create custom provider from env var', () => {
        process.env.BROWSER_ENDPOINT = 'wss://my-browser.example.com';

        const provider = createProvider();

        expect(provider.type).toBe('custom');
        expect(provider.name).toBe('Custom Endpoint');
        expect(provider.getEndpoint()).toBe('wss://my-browser.example.com');
      });

      it('should create custom provider from config', () => {
        const provider = createProvider({
          type: 'custom',
          customEndpoint: 'wss://custom.example.com',
        });

        expect(provider.type).toBe('custom');
        expect(provider.validate().valid).toBe(true);
      });

      it('should fail validation without endpoint', () => {
        const provider = createProvider({ type: 'custom' });

        const validation = provider.validate();
        expect(validation.valid).toBe(false);
        expect(validation.error).toContain('BROWSER_ENDPOINT');
      });

      it('should fail validation with invalid URL', () => {
        const provider = createProvider({
          type: 'custom',
          customEndpoint: 'not-a-valid-url',
        });

        const validation = provider.validate();
        expect(validation.valid).toBe(false);
        expect(validation.error).toContain('Invalid endpoint URL');
      });
    });

    describe('Provider Priority', () => {
      it('should prioritize BROWSER_PROVIDER env var', () => {
        process.env.BROWSER_PROVIDER = 'browserless';
        process.env.BROWSERLESS_TOKEN = 'token';
        process.env.BRIGHTDATA_AUTH = 'user:pass';

        const provider = createProvider();
        expect(provider.type).toBe('browserless');
      });

      it('should auto-detect brightdata over browserless', () => {
        process.env.BRIGHTDATA_AUTH = 'user:pass';
        process.env.BROWSERLESS_TOKEN = 'token';

        const provider = createProvider();
        expect(provider.type).toBe('brightdata');
      });

      it('should auto-detect browserless over custom', () => {
        process.env.BROWSERLESS_TOKEN = 'token';
        process.env.BROWSER_ENDPOINT = 'wss://custom.com';

        const provider = createProvider();
        expect(provider.type).toBe('browserless');
      });
    });
  });

  describe('getProviderInfo', () => {
    it('should return info for all providers', () => {
      const info = getProviderInfo();

      expect(info).toHaveLength(4);
      expect(info.map(p => p.type)).toEqual(['local', 'browserless', 'brightdata', 'custom']);
    });

    it('should show local as always configured', () => {
      const info = getProviderInfo();
      const local = info.find(p => p.type === 'local');

      expect(local?.configured).toBe(true);
      expect(local?.envVars).toEqual([]);
    });

    it('should show browserless as configured when env var set', () => {
      process.env.BROWSERLESS_TOKEN = 'token';

      const info = getProviderInfo();
      const browserless = info.find(p => p.type === 'browserless');

      expect(browserless?.configured).toBe(true);
      expect(browserless?.envVars).toContain('BROWSERLESS_TOKEN');
    });

    it('should show brightdata as not configured by default', () => {
      const info = getProviderInfo();
      const brightdata = info.find(p => p.type === 'brightdata');

      expect(brightdata?.configured).toBe(false);
      expect(brightdata?.envVars).toContain('BRIGHTDATA_AUTH');
    });

    it('should include capabilities for each provider', () => {
      const info = getProviderInfo();

      const brightdata = info.find(p => p.type === 'brightdata');
      expect(brightdata?.capabilities.antiBot).toBe(true);

      const local = info.find(p => p.type === 'local');
      expect(local?.capabilities.antiBot).toBe(false);
    });
  });

  describe('Provider Capabilities', () => {
    it('should have correct capabilities for each provider type', () => {
      const testCases: Array<{ type: BrowserProviderType; antiBot: boolean; geoTargeting: boolean }> = [
        { type: 'local', antiBot: false, geoTargeting: false },
        { type: 'browserless', antiBot: false, geoTargeting: false },
        { type: 'brightdata', antiBot: true, geoTargeting: true },
        { type: 'custom', antiBot: false, geoTargeting: false },
      ];

      for (const tc of testCases) {
        // Set up required credentials for each provider
        if (tc.type === 'browserless') {
          process.env.BROWSERLESS_TOKEN = 'token';
        } else if (tc.type === 'brightdata') {
          process.env.BRIGHTDATA_AUTH = 'user:pass';
        } else if (tc.type === 'custom') {
          process.env.BROWSER_ENDPOINT = 'wss://test.com';
        }

        const provider = createProvider({ type: tc.type });
        expect(provider.capabilities.antiBot).toBe(tc.antiBot);
        expect(provider.capabilities.geoTargeting).toBe(tc.geoTargeting);

        // Clean up
        delete process.env.BROWSERLESS_TOKEN;
        delete process.env.BRIGHTDATA_AUTH;
        delete process.env.BROWSER_ENDPOINT;
      }
    });
  });

  describe('Connection Options', () => {
    it('should return timeout in connection options', () => {
      const provider = createProvider({
        type: 'browserless',
        browserlessToken: 'token',
        timeout: 60000,
      });

      const options = provider.getConnectionOptions();
      expect(options.timeout).toBe(60000);
    });

    it('should use default timeout when not specified', () => {
      process.env.BROWSERLESS_TOKEN = 'token';
      const provider = createProvider();

      const options = provider.getConnectionOptions();
      expect(options.timeout).toBe(30000);
    });

    it('should use longer timeout for brightdata by default', () => {
      process.env.BRIGHTDATA_AUTH = 'user:pass';
      const provider = createProvider();

      const options = provider.getConnectionOptions();
      expect(options.timeout).toBe(60000); // Longer for anti-bot processing
    });
  });
});
