/**
 * Browser Manager - Handles Playwright browser lifecycle
 *
 * Playwright is OPTIONAL - the module gracefully degrades if not installed.
 * Check isPlaywrightAvailable() before using browser functionality.
 */

import type { Browser, BrowserContext, Page } from 'playwright';
import type { NetworkRequest, ConsoleMessage } from '../types/index.js';
import * as fs from 'fs';

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
    console.error('[BrowserManager] Playwright not available:', playwrightLoadError);
    console.error('[BrowserManager] The system will work without Playwright using intelligence and lightweight tiers.');
    console.error('[BrowserManager] To enable full browser rendering, install Playwright: npm install playwright && npx playwright install chromium');
    return null;
  }
}

export interface BrowserConfig {
  headless?: boolean;
  screenshotDir?: string;
  slowMo?: number; // Slow down actions for debugging
  devtools?: boolean;
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

  constructor(config: Partial<BrowserConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
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
      this.browser = await pw.chromium.launch({
        headless: this.config.headless,
        slowMo: this.config.slowMo,
        devtools: this.config.devtools,
      });

      // Ensure screenshot directory exists
      if (this.config.screenshotDir) {
        fs.mkdirSync(this.config.screenshotDir, { recursive: true });
      }
    }
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
      timeout: options.timeout || 30000,
    });

    // Give JavaScript a moment to execute
    await page.waitForTimeout(1000);

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
