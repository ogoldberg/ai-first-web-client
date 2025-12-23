/**
 * Browser Manager - Handles Playwright browser lifecycle
 *
 * Playwright is OPTIONAL - the module gracefully degrades if not installed.
 * Check isPlaywrightAvailable() before using browser functionality.
 *
 * Supports multiple browser providers:
 * - Local: Uses installed Playwright (default)
 * - Browserless.io: Set BROWSERLESS_TOKEN env var
 * - Bright Data: Set BRIGHTDATA_AUTH env var (best for anti-bot)
 * - Custom: Set BROWSER_ENDPOINT env var
 */

import type { Browser, BrowserContext, Page } from 'playwright';
import type { NetworkRequest, ConsoleMessage } from '../types/index.js';
import { TIMEOUTS } from '../utils/timeouts.js';
import * as fs from 'fs';
import { logger } from '../utils/logger.js';
import { createRequire } from 'module';
import {
  createProvider,
  getProviderInfo,
  type BrowserProvider,
  type BrowserProviderType,
  type BrowserProviderConfig,
} from './browser-providers.js';

// Create a require function for ESM compatibility
const require = createRequire(import.meta.url);

// Re-export Page type for consumers
export type { Page } from 'playwright';

// Lazy-loaded Playwright reference
let playwrightModule: typeof import('playwright') | null = null;
let playwrightLoadAttempted = false;
let playwrightLoadError: string | null = null;

/**
 * Try to load Playwright dynamically
 */
async function tryLoadPlaywright(): Promise<typeof import('playwright') | null> {
  if (playwrightLoadAttempted) {
    return playwrightModule;
  }

  playwrightLoadAttempted = true;

  try {
    playwrightModule = await import('playwright');
    return playwrightModule;
  } catch (error) {
    playwrightLoadError = error instanceof Error ? error.message : 'Failed to load Playwright';
    logger.browser.warn('Playwright not available', { error: playwrightLoadError });
    logger.browser.info('System will work without Playwright using intelligence and lightweight tiers');
    logger.browser.info('To enable full browser rendering, install Playwright: npm install playwright && npx playwright install chromium');
    return null;
  }
}

export interface BrowserConfig {
  headless?: boolean;
  screenshotDir?: string;
  slowMo?: number; // Slow down actions for debugging
  devtools?: boolean;
  // Provider configuration (auto-detected from env vars if not specified)
  provider?: Partial<BrowserProviderConfig>;
}

const DEFAULT_CONFIG: BrowserConfig = {
  headless: true,
  screenshotDir: '/tmp/browser-screenshots',
  slowMo: 0,
  devtools: false,
};

export class BrowserManager {
  private browser: Browser | null = null;
  private contexts: Map<string, BrowserContext> = new Map();
  private config: BrowserConfig;
  private provider: BrowserProvider;

  constructor(config: Partial<BrowserConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.provider = createProvider(this.config.provider);
  }

  /**
   * Check if Playwright is available without loading it
   */
  static isPlaywrightAvailable(): boolean {
    if (playwrightLoadAttempted) {
      return playwrightModule !== null;
    }

    // Check if playwright is in node_modules without loading it
    try {
      require.resolve('playwright');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get the Playwright load error if any
   */
  static getPlaywrightError(): string | null {
    return playwrightLoadError;
  }

  /**
   * Update configuration at runtime
   */
  setConfig(config: Partial<BrowserConfig>): void {
    this.config = { ...this.config, ...config };
    // If headless mode changed, need to restart browser
    if (config.headless !== undefined && this.browser) {
      this.cleanup().then(() => this.initialize());
    }
  }

  /**
   * Enable visual debugging mode (non-headless with devtools)
   */
  enableDebugMode(): void {
    this.setConfig({ headless: false, devtools: true, slowMo: 100 });
  }

  /**
   * Disable visual debugging mode (return to headless)
   */
  disableDebugMode(): void {
    this.setConfig({ headless: true, devtools: false, slowMo: 0 });
  }

  /**
   * Ensure Playwright is available, throwing a helpful error if not
   */
  private async ensurePlaywright(): Promise<typeof import('playwright')> {
    const pw = await tryLoadPlaywright();
    if (!pw) {
      throw new Error(
        'Playwright is not installed. ' +
        'Install it with: npm install playwright && npx playwright install chromium\n' +
        'Or use the intelligence/lightweight tiers which work without Playwright.'
      );
    }
    return pw;
  }

  async initialize(): Promise<void> {
    if (!this.browser) {
      const pw = await this.ensurePlaywright();

      // Validate provider configuration
      const validation = this.provider.validate();
      if (!validation.valid) {
        throw new Error(validation.error);
      }

      const endpoint = this.provider.getEndpoint();

      if (endpoint) {
        // Remote browser connection
        const safeEndpoint = endpoint
          .replace(/token=[^&]+/, 'token=***')
          .replace(/:[^:@]+@/, ':***@'); // Hide passwords in URLs

        logger.browser.info('Connecting to remote browser', {
          provider: this.provider.name,
          type: this.provider.type,
          endpoint: safeEndpoint,
          capabilities: this.provider.capabilities,
        });

        try {
          const connectionOptions = this.provider.getConnectionOptions();
          this.browser = await pw.chromium.connect(endpoint, connectionOptions);
          logger.browser.info('Connected to remote browser successfully', {
            provider: this.provider.name,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          logger.browser.error('Failed to connect to remote browser', {
            provider: this.provider.name,
            error: message,
          });
          throw new Error(
            `Failed to connect to ${this.provider.name}: ${message}\n` +
            `Provider type: ${this.provider.type}`
          );
        }
      } else {
        // Local browser launch
        logger.browser.info('Launching local browser', {
          headless: this.config.headless,
        });
        this.browser = await pw.chromium.launch({
          headless: this.config.headless,
          slowMo: this.config.slowMo,
          devtools: this.config.devtools,
        });
      }

      // Ensure screenshot directory exists
      if (this.config.screenshotDir) {
        fs.mkdirSync(this.config.screenshotDir, { recursive: true });
      }
    }
  }

  /**
   * Check if using a remote browser provider
   */
  isUsingRemoteBrowser(): boolean {
    return this.provider.type !== 'local';
  }

  /**
   * Get the current browser provider
   */
  getProvider(): BrowserProvider {
    return this.provider;
  }

  /**
   * Get information about all available providers
   */
  static getAvailableProviders() {
    return getProviderInfo();
  }

  async getContext(profile: string = 'default'): Promise<BrowserContext> {
    await this.initialize();

    if (!this.contexts.has(profile)) {
      const context = await this.browser!.newContext({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        viewport: { width: 1920, height: 1080 },
      });
      this.contexts.set(profile, context);
    }

    return this.contexts.get(profile)!;
  }

  async browse(
    url: string,
    options: {
      captureNetwork?: boolean;
      captureConsole?: boolean;
      waitFor?: 'load' | 'domcontentloaded' | 'networkidle';
      timeout?: number;
      profile?: string;
    } = {}
  ): Promise<{
    page: Page;
    network: NetworkRequest[];
    console: ConsoleMessage[];
  }> {
    const context = await this.getContext(options.profile);
    const page = await context.newPage();

    const networkRequests: NetworkRequest[] = [];
    const consoleMessages: ConsoleMessage[] = [];

    // Network interception
    if (options.captureNetwork !== false) {
      const requestTiming = new Map<string, number>();

      page.on('request', (request) => {
        requestTiming.set(request.url(), Date.now());
      });

      page.on('response', async (response) => {
        const startTime = requestTiming.get(response.url()) || Date.now();
        const duration = Date.now() - startTime;

        let responseBody: unknown;
        const contentType = response.headers()['content-type'] || '';

        // Capture JSON responses
        if (contentType.includes('application/json')) {
          try {
            responseBody = await response.json();
          } catch {
            // Failed to parse JSON
          }
        }

        networkRequests.push({
          url: response.url(),
          method: response.request().method(),
          status: response.status(),
          statusText: response.statusText(),
          headers: response.headers(),
          requestHeaders: response.request().headers(),
          responseBody,
          contentType,
          timestamp: startTime,
          duration,
        });
      });
    }

    // Console capture
    if (options.captureConsole !== false) {
      page.on('console', (msg) => {
        consoleMessages.push({
          type: msg.type() as ConsoleMessage['type'],
          text: msg.text(),
          timestamp: Date.now(),
          location: msg.location() ? {
            url: msg.location().url,
            lineNumber: msg.location().lineNumber,
            columnNumber: msg.location().columnNumber,
          } : undefined,
        });
      });
    }

    // Navigate to URL
    const waitUntil = options.waitFor || 'networkidle';
    await page.goto(url, {
      waitUntil,
      timeout: options.timeout || TIMEOUTS.PAGE_LOAD,
    });

    // Give JavaScript a moment to execute
    await page.waitForTimeout(TIMEOUTS.PAGE_STABILIZE);

    return {
      page,
      network: networkRequests,
      console: consoleMessages,
    };
  }

  async cleanup(): Promise<void> {
    for (const context of this.contexts.values()) {
      await context.close();
    }
    this.contexts.clear();

    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  /**
   * Take a screenshot of the current page
   */
  async screenshot(
    page: Page,
    options: {
      name?: string;
      fullPage?: boolean;
      element?: string; // CSS selector for specific element
    } = {}
  ): Promise<string> {
    const timestamp = Date.now();
    const name = options.name || `screenshot-${timestamp}`;
    const filename = `${this.config.screenshotDir}/${name}.png`;

    if (options.element) {
      // Screenshot specific element
      const element = await page.$(options.element);
      if (element) {
        await element.screenshot({ path: filename });
      } else {
        throw new Error(`Element not found: ${options.element}`);
      }
    } else {
      // Full page or viewport screenshot
      await page.screenshot({
        path: filename,
        fullPage: options.fullPage ?? true,
      });
    }

    return filename;
  }

  /**
   * Take a screenshot and return as base64
   */
  async screenshotBase64(
    page: Page,
    options: {
      fullPage?: boolean;
      element?: string;
    } = {}
  ): Promise<string> {
    let buffer: Buffer;

    if (options.element) {
      const element = await page.$(options.element);
      if (element) {
        buffer = await element.screenshot();
      } else {
        throw new Error(`Element not found: ${options.element}`);
      }
    } else {
      buffer = await page.screenshot({
        fullPage: options.fullPage ?? true,
      });
    }

    return buffer.toString('base64');
  }

  /**
   * Browse and capture screenshots at key points
   */
  async browseWithScreenshots(
    url: string,
    options: {
      captureOnLoad?: boolean;
      captureOnError?: boolean;
      prefix?: string;
      profile?: string;
    } = {}
  ): Promise<{
    page: Page;
    screenshots: string[];
    network: NetworkRequest[];
    console: ConsoleMessage[];
  }> {
    const screenshots: string[] = [];
    const prefix = options.prefix || new URL(url).hostname.replace(/\./g, '-');

    try {
      const result = await this.browse(url, { profile: options.profile });

      if (options.captureOnLoad !== false) {
        const path = await this.screenshot(result.page, {
          name: `${prefix}-loaded`,
          fullPage: true,
        });
        screenshots.push(path);
      }

      return {
        ...result,
        screenshots,
      };
    } catch (error) {
      if (options.captureOnError) {
        // Try to capture what we can on error
        const context = await this.getContext(options.profile);
        const pages = context.pages();
        if (pages.length > 0) {
          try {
            const path = await this.screenshot(pages[0], {
              name: `${prefix}-error`,
              fullPage: false,
            });
            screenshots.push(path);
          } catch {
            // Ignore screenshot errors during error handling
          }
        }
      }
      throw error;
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): BrowserConfig {
    return { ...this.config };
  }
}
