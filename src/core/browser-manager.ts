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

import type { Browser, BrowserContext, Page, WebSocket as PlaywrightWebSocket } from 'playwright';
import type { NetworkRequest, ConsoleMessage, WebSocketConnection, WebSocketMessage } from '../types/index.js';
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
import {
  playwrightNotInstalledError,
  remoteBrowserConnectionError,
} from '../utils/error-messages.js';
import {
  launchStealthBrowser,
  generateFingerprint,
  createStealthContext,
  type BrowserFingerprint,
} from './stealth-browser.js';

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
  // Stealth configuration
  stealth?: boolean | 'auto'; // Enable stealth mode (default: 'auto')
  fingerprintSeed?: string; // Seed for consistent fingerprint generation
}

const DEFAULT_CONFIG: BrowserConfig = {
  headless: true,
  screenshotDir: '/tmp/browser-screenshots',
  slowMo: 0,
  devtools: false,
  stealth: 'auto',
};

export class BrowserManager {
  private browser: Browser | null = null;
  private contexts: Map<string, BrowserContext> = new Map();
  private config: BrowserConfig;
  private provider: BrowserProvider;
  private fingerprint: BrowserFingerprint | null = null;
  private stealthEnabled: boolean = false;
  private slotReleaseFunction: (() => void) | null = null;
  private sessionId: string;

  constructor(config: Partial<BrowserConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.provider = createProvider(this.config.provider);
    // Generate a unique session ID for rate limiting tracking
    this.sessionId = `browser-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
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
      throw new Error(playwrightNotInstalledError());
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

        // For rate-limited providers (like Browserless), acquire a slot first
        if (this.provider.acquireSlot) {
          try {
            logger.browser.debug('Acquiring rate limiter slot', {
              sessionId: this.sessionId,
              provider: this.provider.name,
            });
            this.slotReleaseFunction = await this.provider.acquireSlot(this.sessionId);
            logger.browser.debug('Rate limiter slot acquired', {
              sessionId: this.sessionId,
            });
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            logger.browser.error('Failed to acquire rate limiter slot', {
              provider: this.provider.name,
              error: message,
            });
            throw error;
          }
        }

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
          // Use connectOverCDP for Chrome DevTools Protocol connections
          // This is required for Browserless.io and other CDP-based browser services
          // chromium.connect() is for Playwright's own browser server protocol
          this.browser = await pw.chromium.connectOverCDP(endpoint, connectionOptions);
          logger.browser.info('Connected to remote browser successfully', {
            provider: this.provider.name,
          });
        } catch (error) {
          // Release the slot if connection failed
          if (this.slotReleaseFunction) {
            this.slotReleaseFunction();
            this.slotReleaseFunction = null;
          }
          const message = error instanceof Error ? error.message : 'Unknown error';
          logger.browser.error('Failed to connect to remote browser', {
            provider: this.provider.name,
            error: message,
          });
          throw new Error(remoteBrowserConnectionError(
            this.provider.name,
            this.provider.type,
            message
          ));
        }
      } else {
        // Local browser launch with stealth mode
        logger.browser.info('Launching local browser', {
          headless: this.config.headless,
          stealth: this.config.stealth,
        });

        const stealthResult = await launchStealthBrowser({
          stealth: this.config.stealth,
          fingerprintSeed: this.config.fingerprintSeed,
          launchOptions: {
            headless: this.config.headless,
            slowMo: this.config.slowMo,
            devtools: this.config.devtools,
          },
        });

        this.browser = stealthResult.browser;
        this.fingerprint = stealthResult.fingerprint;
        this.stealthEnabled = stealthResult.stealthEnabled;

        logger.browser.info('Local browser launched', {
          stealthEnabled: this.stealthEnabled,
          platform: this.fingerprint.platform,
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
      let context: BrowserContext;

      if (this.stealthEnabled && this.fingerprint) {
        // Use stealth context with learned fingerprint for anti-bot evasion
        context = await createStealthContext(this.browser!, this.fingerprint, {
          applyEvasionScripts: true,
        });
      } else {
        // Fallback to standard context
        context = await this.browser!.newContext({
          userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          viewport: { width: 1920, height: 1080 },
        });
      }

      this.contexts.set(profile, context);
    }

    return this.contexts.get(profile)!;
  }

  /**
   * Check if stealth mode is enabled
   */
  isStealthEnabled(): boolean {
    return this.stealthEnabled;
  }

  /**
   * Get the current browser fingerprint (if stealth is enabled)
   */
  getFingerprint(): BrowserFingerprint | null {
    return this.fingerprint;
  }

  async browse(
    url: string,
    options: {
      captureNetwork?: boolean;
      captureConsole?: boolean;
      captureWebSockets?: boolean;
      waitFor?: 'load' | 'domcontentloaded' | 'networkidle';
      timeout?: number;
      profile?: string;
    } = {}
  ): Promise<{
    page: Page;
    network: NetworkRequest[];
    console: ConsoleMessage[];
    websockets: WebSocketConnection[];
  }> {
    const context = await this.getContext(options.profile);
    const page = await context.newPage();

    const networkRequests: NetworkRequest[] = [];
    const consoleMessages: ConsoleMessage[] = [];
    const websocketConnections: WebSocketConnection[] = [];

    // WebSocket capture (FEAT-003)
    if (options.captureWebSockets !== false) {
      page.on('websocket', (ws: PlaywrightWebSocket) => {
        const connection: WebSocketConnection = {
          url: ws.url(),
          protocol: 'websocket', // Will be refined by pattern learner
          connectedAt: Date.now(),
          headers: {},
          messages: [],
        };

        // Capture incoming messages (server -> client)
        ws.on('framereceived', (event: any) => {
          try {
            const payload = event.payload;
            let data: any;
            try {
              data = JSON.parse(payload);
            } catch {
              data = payload;
            }

            const message: WebSocketMessage = {
              direction: 'receive',
              data,
              rawData: payload,
              timestamp: Date.now(),
              type: typeof data === 'object' && data !== null ? 'json' : 'text',
            };

            connection.messages.push(message);
          } catch (error) {
            logger.browser.warn('Failed to parse WebSocket frame', { error });
          }
        });

        // Capture outgoing messages (client -> server)
        ws.on('framesent', (event: any) => {
          try {
            const payload = event.payload;
            let data: any;
            try {
              data = JSON.parse(payload);
            } catch {
              data = payload;
            }

            const message: WebSocketMessage = {
              direction: 'send',
              data,
              rawData: payload,
              timestamp: Date.now(),
              type: typeof data === 'object' && data !== null ? 'json' : 'text',
            };

            connection.messages.push(message);
          } catch (error) {
            logger.browser.warn('Failed to parse WebSocket frame', { error });
          }
        });

        // Track connection close
        ws.on('close', () => {
          connection.closedAt = Date.now();
          websocketConnections.push(connection);
        });

        // If connection is never closed, add it after page navigation completes
        // This is handled by pushing active connections at the end of browse()
      });
    }

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
      websockets: websocketConnections,
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

    // Release the rate limiter slot if one was acquired
    if (this.slotReleaseFunction) {
      logger.browser.debug('Releasing rate limiter slot', {
        sessionId: this.sessionId,
      });
      this.slotReleaseFunction();
      this.slotReleaseFunction = null;
    }
  }

  /**
   * Get usage stats from the provider (if rate-limited)
   */
  getUsageStats(): { unitsUsed: number; unitsRemaining: number; activeConnections: number } | null {
    if (this.provider.getUsageStats) {
      const stats = this.provider.getUsageStats();
      return {
        unitsUsed: stats.unitsUsed,
        unitsRemaining: stats.unitsRemaining,
        activeConnections: stats.activeConnections,
      };
    }
    return null;
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
